/**
 * 端口管理器（方案 §5.4 扫描流水线组装，方案 §10：当前数据来自
 * PlatformAdapter → PortScanner → MemoryStore → Renderer）：
 * 每轮：监听扫描 → 全量进程表刷新 → 新涉及 PID 批量补工作目录 → PortRecord 组装
 * （timing 继承 + exposure + security 基础字段）→ DiffEngine → 应用快照。
 * 任一步失败保留上一快照并返回 error（由 PortScanner 推 SCAN_ERROR）。
 * security 完整判定属阶段 4 SecurityClassifier，本阶段固定 UNKNOWN（接口位已留）。
 */
import type { DiffEvent, PortListResult, PortRecord, ProcessInfo } from '../../../shared/types'
import type { PlatformAdapter, RawPort } from '../../platform/types'
import type { ProcessResolver } from '../resolve/ProcessResolver'
import { MemoryStore } from '../store/MemoryStore'
import { computeStats } from './exposure'
import { diffSnapshots } from './DiffEngine'
import { buildRecordId } from './recordId'
import { searchRecords } from '../search/SearchEngine'

export interface ScanCycleResult {
  events: DiffEvent[]
  /** 本轮错误信息（null = 成功） */
  error: string | null
  records: PortRecord[]
  stats: PortListResult['stats']
}

export class PortManager {
  private readonly store = new MemoryStore()

  constructor(
    private readonly adapter: PlatformAdapter,
    private readonly resolver: ProcessResolver
  ) {}

  /**
   * 当前快照（方案 §4.2 / §5.12）：
   * - query 为空 → 全量记录（端口升序）、matches 为空对象；
   * - query 非空 → SearchEngine 过滤排序（score desc），stats 恒为全量口径（统计条不随搜索变化），
   *   matches 按 recordId 附带关键词得分与各字段命中区间（供 HighlightText 统一渲染）。
   * 仅当前快照；历史检索一律走 port:history（v1.2 m-05）。
   */
  listSnapshot(query = ''): PortListResult {
    const all = this.store.list()
    const stats = computeStats(all)
    if (query.trim().length === 0) {
      return { records: all, stats, matches: {} }
    }
    const matches = searchRecords(all, query)
    return {
      records: matches.map((match) => match.record),
      stats,
      matches: Object.fromEntries(
        matches.map((match) => [
          match.record.recordId,
          { score: match.score, highlights: match.highlights }
        ])
      )
    }
  }

  findRecord(recordId: string): PortRecord | null {
    return this.store.get(recordId) ?? null
  }

  async scanCycle(): Promise<ScanCycleResult> {
    let error: string | null = null
    let events: DiffEvent[] = []
    try {
      const ports = await this.adapter.scanPorts()
      const procTable = await this.adapter.getProcessTable()
      this.resolver.refresh(procTable)

      const involvedPids = [...new Set(ports.map((port) => port.pid))]
      const missing = this.resolver.missingCwdPids(involvedPids)
      if (missing.length > 0) {
        const cwds = await this.adapter.getWorkingDirectories(missing)
        for (const [pid, cwd] of cwds) {
          this.resolver.setCwd(pid, cwd)
        }
      }

      const now = Date.now()
      const next = ports.map((port) => this.assembleRecord(port, now))
      events = diffSnapshots(this.store.list(), next)
      this.store.replaceAll(next)
    } catch (cycleError) {
      error = cycleError instanceof Error ? cycleError.message : String(cycleError)
    }
    const snapshot = this.listSnapshot()
    return { events, error, records: snapshot.records, stats: snapshot.stats }
  }

  /** 单条原始监听记录 → PortRecord（timing 继承既有 firstSeen；lastSeen 每轮刷新） */
  private assembleRecord(port: RawPort, now: number): PortRecord {
    const proc = this.resolver.get(port.pid)
    const cwd = this.resolver.getCwd(port.pid)
    const recordId = buildRecordId(port.protocol, port.localAddress, port.localPort, port.pid)
    const existing = this.store.get(recordId)

    const executablePath = proc?.executablePath
    const name =
      (executablePath !== undefined && executablePath.length > 0
        ? executablePath.split('/').pop()
        : '') || port.command

    const processInfo: ProcessInfo = {
      pid: port.pid,
      ppid: proc?.ppid,
      name,
      executablePath,
      commandLine: proc && proc.commandLine.length > 0 ? proc.commandLine : undefined,
      workingDirectory: cwd,
      user: proc?.user,
      uid: proc?.uid,
      startedAt: proc?.startedAt
    }

    return {
      recordId,
      protocol: port.protocol,
      localAddress: port.localAddress,
      localPort: port.localPort,
      remoteAddress: port.remoteAddress ?? undefined,
      remotePort: port.remotePort ?? undefined,
      state: port.state ?? undefined,
      pid: port.pid,
      process: processInfo,
      // application / project / container：阶段 4 Resolver 接入（R-03 字段位保留，本阶段不设）
      timing: {
        firstSeen: existing?.timing.firstSeen ?? now,
        lastSeen: now
      },
      security: { level: 'UNKNOWN' },
      runtime: proc ? { cpuPercent: proc.cpuPercent, memPercent: proc.memPercent } : undefined
    }
  }
}
