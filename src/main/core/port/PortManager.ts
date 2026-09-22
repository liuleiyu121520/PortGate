/**
 * 端口管理器（方案 §5.4 扫描流水线组装，方案 §10：当前数据来自
 * PlatformAdapter → PortScanner → MemoryStore → Renderer）：
 * 每轮：监听扫描 → 全量进程表刷新 → 新涉及 PID 批量补工作目录 → Resolver 增强
 * （§5.7~5.9，均带缓存）→ PortRecord 组装（timing 继承 + exposure + security）→
 * DiffEngine → 应用快照。任一步失败保留上一快照并返回 error（由 PortScanner 推 SCAN_ERROR）。
 * SecurityClassifier 完整规则随阶段 4 接入（组装层注入 classify）。
 */
import type {
  ApplicationInfo,
  ContainerInfo,
  DiffEvent,
  PortListResult,
  PortRecord,
  ProcessInfo,
  ProjectInfo
} from '../../../shared/types'
import type { PlatformAdapter, RawPort } from '../../platform/types'
import type { ProcessResolver } from '../resolve/ProcessResolver'
import type { SecurityInput } from '../security/SecurityClassifier'
import type { SessionStore } from '../store/SessionStore'
import { MemoryStore } from '../store/MemoryStore'
import { computeStats } from './exposure'
import { diffSnapshots } from './DiffEngine'
import { buildRecordId } from './recordId'
import { searchRecords } from '../search/SearchEngine'

/** 扫描流水线增强器（方案 §5.7~5.10：Resolver 增强 + 保护级判定，均由组装层注入） */
export interface PortManagerEnhancers {
  /** 宿主应用识别（走 ProcessResolver 树缓存，不重复执行外部命令） */
  application?: (record: Pick<PortRecord, 'pid' | 'process'>) => ApplicationInfo | undefined
  /** 项目识别（基于 cwd 向上查 marker） */
  project?: (pid: number, cwd: string | undefined) => ProjectInfo | undefined
  /** Docker 端口映射关联（内部 10s 节流 + 静默降级） */
  docker?: (localAddress: string, localPort: number) => ContainerInfo | undefined
  /** 保护级判定（方案 §5.10 七规则） */
  classify?: (input: SecurityInput) => PortRecord['security']['level']
}

export interface ScanCycleResult {
  events: DiffEvent[]
  /** 本轮错误信息（null = 成功） */
  error: string | null
  records: PortRecord[]
  stats: PortListResult['stats']
}

/** 扫描周期附加配置（阶段 5：SQLite 会话持久化 + last_seen 批量节流） */
export interface PortManagerOptions {
  /** 会话持久化（提供后按需求 §10.1 在四类 Diff 事件时写库） */
  sessionStore?: SessionStore
  /** last_seen 批量 UPDATE 节流间隔（方案 §5.14：60s） */
  touchIntervalMs?: number
  /** 时钟注入（timing 用例：firstSeen 不变 / lastSeen 递增的可测性） */
  nowFn?: () => number
}

export class PortManager {
  private readonly store = new MemoryStore()
  private readonly enhancers: PortManagerEnhancers
  private readonly sessionStore: SessionStore | undefined
  private readonly touchIntervalMs: number
  private readonly nowFn: () => number
  private lastTouchAt = 0

  constructor(
    private readonly adapter: PlatformAdapter,
    private readonly resolver: ProcessResolver,
    enhancers: PortManagerEnhancers = {},
    options: PortManagerOptions = {}
  ) {
    this.enhancers = enhancers
    this.sessionStore = options.sessionStore
    this.touchIntervalMs = options.touchIntervalMs ?? 60000
    this.nowFn = options.nowFn ?? (() => Date.now())
  }

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
    const now = this.nowFn()
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

      const next = ports.map((port) => this.assembleRecord(port, now))
      events = diffSnapshots(this.store.list(), next)
      this.store.replaceAll(next)
      // 需求 §10.1：只在四类 Diff 事件时写库；last_seen 以 60s 节流批量 UPDATE（方案 §5.14）
      if (this.sessionStore !== undefined) {
        this.sessionStore.applyDiffEvents(events, now)
        if (now - this.lastTouchAt >= this.touchIntervalMs) {
          this.lastTouchAt = now
          this.sessionStore.batchTouch(next, now)
        }
      }
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

    // 阶段 4 增强：Resolver 识别 + 保护级判定（container 关联在单测与真机核对覆盖）
    const draft: Pick<PortRecord, 'pid' | 'process'> = { pid: port.pid, process: processInfo }
    const application = this.enhancers.application?.(draft)
    const project = cwd !== undefined ? this.enhancers.project?.(port.pid, cwd) : undefined
    const container = this.enhancers.docker?.(port.localAddress, port.localPort)
    const level =
      this.enhancers.classify?.({
        pid: port.pid,
        uid: proc?.uid,
        user: proc?.user,
        executablePath
      }) ?? 'UNKNOWN'

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
      application,
      project,
      container,
      timing: {
        firstSeen: existing?.timing.firstSeen ?? now,
        lastSeen: now
      },
      security: { level },
      runtime: proc ? { cpuPercent: proc.cpuPercent, memPercent: proc.memPercent } : undefined
    }
  }
}
