/**
 * SessionStore（方案 §5.14 / 需求 §10.1/§10.2/§11，AC-12/13）：
 * - 写入原则严格按需求 §10.1：只在四类 Diff 事件时写库——
 *   PORT_OPENED → INSERT；PORT_CLOSED → closed_at 收口；
 *   PORT_CHANGED → UPDATE state/last_seen；PROCESS_CHANGED → 旧收口 + 新 INSERT（单事务）；
 * - batchTouch：60s 节流（节流判断在 PortManager）批量 UPDATE 仍未关闭会话的 last_seen_at（单事务）；
 * - queryHistory：SQL LIKE 预筛最近 1000 条已收口会话（各关键词 AND、跨拼接字段列），
 *   再过同一 SearchEngine 评分排序（当前/历史共用同一套搜索逻辑，R-02）；返回 PortSession[]。
 * 表 DDL 逐字采用需求 §10.2（id TEXT PRIMARY KEY 取记录身份 recordId，重开覆盖为 V1 简化）。
 */
import type Database from 'better-sqlite3'
import type {
  DiffEvent,
  PortRecord,
  PortSession,
  SecurityLevel
} from '../../../shared/types'
import { searchRecords, tokenizeQuery } from '../search/SearchEngine'

const HISTORY_SCAN_LIMIT = 1000

/** 历史检索的 LIKE 预筛列集合（跨拼接字段列，需求 §11） */
const LIKE_COLUMNS: readonly string[] = [
  'id',
  'protocol',
  'local_address',
  'process_name',
  'executable_path',
  'command_line',
  'working_directory',
  'user_name',
  'application_name',
  'project_name',
  'container_name',
  'docker_image',
  'CAST(local_port AS TEXT)'
]

interface SessionRow {
  id: string
  protocol: 'TCP' | 'UDP'
  local_address: string
  local_port: number
  remote_address: string | null
  remote_port: number | null
  state: string | null
  pid: number
  ppid: number | null
  process_name: string
  executable_path: string | null
  command_line: string | null
  working_directory: string | null
  user_name: string | null
  application_name: string | null
  application_path: string | null
  project_name: string | null
  project_path: string | null
  container_name: string | null
  docker_image: string | null
  protection_level: string | null
  process_started_at: number | null
  first_seen_at: number
  last_seen_at: number
  closed_at: number | null
}

function rowToSession(row: SessionRow): PortSession {
  return {
    id: row.id,
    protocol: row.protocol,
    localAddress: row.local_address,
    localPort: row.local_port,
    remoteAddress: row.remote_address ?? undefined,
    remotePort: row.remote_port ?? undefined,
    state: row.state ?? undefined,
    pid: row.pid,
    ppid: row.ppid ?? undefined,
    processName: row.process_name,
    executablePath: row.executable_path ?? undefined,
    commandLine: row.command_line ?? undefined,
    workingDirectory: row.working_directory ?? undefined,
    userName: row.user_name ?? undefined,
    applicationName: row.application_name ?? undefined,
    applicationPath: row.application_path ?? undefined,
    projectName: row.project_name ?? undefined,
    projectPath: row.project_path ?? undefined,
    containerName: row.container_name ?? undefined,
    dockerImage: row.docker_image ?? undefined,
    protectionLevel: (row.protection_level ?? undefined) as SecurityLevel | undefined,
    processStartedAt: row.process_started_at ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    closedAt: row.closed_at ?? undefined
  }
}

/** 历史会话 → 检索用伪 PortRecord（喂同一 SearchEngine，R-02 共用搜索与评分） */
function sessionToRecord(session: PortSession): PortRecord {
  return {
    recordId: session.id,
    protocol: session.protocol,
    localAddress: session.localAddress,
    localPort: session.localPort,
    state: session.state,
    pid: session.pid,
    process: {
      pid: session.pid,
      name: session.processName,
      executablePath: session.executablePath,
      commandLine: session.commandLine,
      workingDirectory: session.workingDirectory,
      user: session.userName,
      ppid: session.ppid
    },
    application:
      session.applicationName !== undefined
        ? { name: session.applicationName, path: session.applicationPath }
        : undefined,
    project:
      session.projectName !== undefined || session.projectPath !== undefined
        ? { name: session.projectName, path: session.projectPath }
        : undefined,
    container:
      session.containerName !== undefined || session.dockerImage !== undefined
        ? { name: session.containerName, image: session.dockerImage }
        : undefined,
    timing: { firstSeen: session.firstSeenAt, lastSeen: session.lastSeenAt },
    security: { level: session.protectionLevel ?? 'UNKNOWN' }
  }
}

export class SessionStore {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /** 四类 Diff 事件落库（需求 §10.1：只在状态变化时写；单事务） */
  applyDiffEvents(events: readonly DiffEvent[], now: number): void {
    if (events.length === 0) {
      return
    }
    this.db.transaction(() => {
      for (const event of events) {
        switch (event.type) {
          case 'PORT_OPENED':
            this.insertSession(event.record, now)
            break
          case 'PORT_CLOSED':
            this.close(event.recordId, now)
            break
          case 'PORT_CHANGED':
            this.updateChanged(event.record, now)
            break
          case 'PROCESS_CHANGED':
            // 旧会话收口 + 新会话 INSERT（方案 §5.5）
            if (event.prevRecordId !== undefined) {
              this.close(event.prevRecordId, now)
            }
            this.insertSession(event.record, now)
            break
        }
      }
    })()
  }

  /** 批量刷新仍未关闭会话的 last_seen_at（单事务；60s 节流判断在 PortManager） */
  batchTouch(records: readonly PortRecord[], now: number): void {
    const update = this.db.prepare(
      'UPDATE port_session SET last_seen_at = ? WHERE id = ? AND closed_at IS NULL'
    )
    this.db.transaction(() => {
      for (const record of records) {
        update.run(now, record.recordId)
      }
    })()
  }

  /** 会话收口（幂等：仅对未收口行生效）；KillPolicy DONE 与 PORT_CLOSED 事件共用 */
  close(recordId: string, now: number): void {
    this.db
      .prepare('UPDATE port_session SET closed_at = ?, last_seen_at = ? WHERE id = ? AND closed_at IS NULL')
      .run(now, now, recordId)
  }

  /** 按 recordId 查最近一条会话 */
  find(recordId: string): PortSession | undefined {
    const row = this.db.prepare('SELECT * FROM port_session WHERE id = ?').get(recordId) as
      | SessionRow
      | undefined
    return row === undefined ? undefined : rowToSession(row)
  }

  /**
   * 历史检索（需求 §11 / 方案 §5.12）：SQL LIKE 预筛（各关键词 AND、跨拼接字段列）
   * 最近 1000 条已收口会话 → 同一 SearchEngine 评分排序 → PortSession[]（顺序即结果序）。
   * v1.4 MINOR-R4-003：历史不出参命中区间（matches），高亮仅当前 Tab。
   */
  queryHistory(rawQuery: string, limit = HISTORY_SCAN_LIMIT): PortSession[] {
    const keywords = tokenizeQuery(rawQuery)
    const conditions: string[] = ['closed_at IS NOT NULL']
    const params: Array<string | number> = []
    for (const keyword of keywords) {
      const like = `%${keyword}%`
      conditions.push(`(${LIKE_COLUMNS.map((column) => `${column} LIKE ?`).join(' OR ')})`)
      for (let i = 0; i < LIKE_COLUMNS.length; i++) {
        params.push(like)
      }
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM port_session WHERE ${conditions.join(' AND ')} ORDER BY closed_at DESC LIMIT ?`
      )
      .all(...params, limit) as SessionRow[]
    if (rows.length === 0) {
      return []
    }
    const sessions = rows.map(rowToSession)
    // 同一 SearchEngine 评分排序（空查询 → 空匹配 score 0，保持 closed_at 倒序入参序）
    const matches = searchRecords(
      sessions.map(sessionToRecord),
      keywords.length > 0 ? rawQuery : ''
    )
    if (keywords.length === 0) {
      return sessions
    }
    const byId = new Map(sessions.map((session) => [session.id, session]))
    return matches
      .map((match) => byId.get(match.record.recordId))
      .filter((session): session is PortSession => session !== undefined)
  }

  private insertSession(record: PortRecord, now: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO port_session (
          id, protocol, local_address, local_port, remote_address, remote_port, state,
          pid, ppid, process_name, executable_path, command_line, working_directory, user_name,
          application_name, application_path, project_name, project_path,
          container_name, docker_image, protection_level, process_started_at,
          first_seen_at, last_seen_at, closed_at
        ) VALUES (
          @id, @protocol, @localAddress, @localPort, @remoteAddress, @remotePort, @state,
          @pid, @ppid, @processName, @executablePath, @commandLine, @workingDirectory, @userName,
          @applicationName, @applicationPath, @projectName, @projectPath,
          @containerName, @dockerImage, @protectionLevel, @processStartedAt,
          @firstSeenAt, @lastSeenAt, NULL
        )`
      )
      .run(this.sessionParams(record, now))
  }

  private updateChanged(record: PortRecord, now: number): void {
    this.db
      .prepare(
        'UPDATE port_session SET state = ?, last_seen_at = ?, protection_level = ? WHERE id = ?'
      )
      .run(record.state ?? null, now, record.security.level, record.recordId)
  }

  private sessionParams(record: PortRecord, now: number): Record<string, string | number | null> {
    return {
      id: record.recordId,
      protocol: record.protocol,
      localAddress: record.localAddress,
      localPort: record.localPort,
      remoteAddress: record.remoteAddress ?? null,
      remotePort: record.remotePort ?? null,
      state: record.state ?? null,
      pid: record.pid,
      ppid: record.process.ppid ?? null,
      processName: record.process.name,
      executablePath: record.process.executablePath ?? null,
      commandLine: record.process.commandLine ?? null,
      workingDirectory: record.process.workingDirectory ?? null,
      userName: record.process.user ?? null,
      applicationName: record.application?.name ?? null,
      applicationPath: record.application?.path ?? null,
      projectName: record.project?.name ?? null,
      projectPath: record.project?.path ?? null,
      containerName: record.container?.name ?? null,
      dockerImage: record.container?.image ?? null,
      protectionLevel: record.security.level,
      processStartedAt: record.process.startedAt ?? null,
      firstSeenAt: record.timing.firstSeen,
      lastSeenAt: now
    }
  }
}
