/**
 * SessionStore 测试（方案 §5.14 / 需求 §10.1/§10.2，AC-12）：
 * 四类 Diff 事件驱动写入（OPENED insert / CHANGED update / PROCESS_CHANGED 旧收口+新 INSERT /
 * CLOSED 收口幂等）、无变化不写库、batchTouch 仅刷未收口会话、:memory: 全程。
 */
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { DiffEvent, PortRecord } from '../../src/shared/types'
import { migrate } from '../../src/main/db/connection'
import { SessionStore } from '../../src/main/core/store/SessionStore'

function mkRecord(port: number, pid: number, overrides: Partial<PortRecord> = {}): PortRecord {
  return {
    recordId: `TCP:127.0.0.1:${port}:${pid}`,
    protocol: 'TCP',
    localAddress: '127.0.0.1',
    localPort: port,
    pid,
    state: 'LISTEN',
    process: {
      pid,
      name: 'srv',
      executablePath: '/Users/leiyu/work/srv',
      commandLine: 'srv --port 8080',
      workingDirectory: '/Users/leiyu/work',
      user: 'leiyu',
      uid: 501,
      ppid: 1,
      startedAt: 1000
    },
    application: { name: 'Terminal', path: '/Applications/Terminal.app' },
    project: { name: 'demo', path: '/Users/leiyu/work' },
    timing: { firstSeen: 1000, lastSeen: 1000 },
    security: { level: 'USER' },
    ...overrides
  }
}

function opened(record: PortRecord): DiffEvent {
  return { type: 'PORT_OPENED', groupKey: `${record.protocol}:${record.localAddress}:${record.localPort}`, recordId: record.recordId, record }
}

function makeStore(): { store: SessionStore; db: Database.Database } {
  const db = new Database(':memory:')
  migrate(db)
  return { store: new SessionStore(db), db }
}

describe('四类 Diff 事件驱动写入（需求 §10.1）', () => {
  it('PORT_OPENED → INSERT 全字段（含 app/project/保护级）', () => {
    const { store } = makeStore()
    const record = mkRecord(8080, 100)
    store.applyDiffEvents([opened(record)], 5000)
    const session = store.find(record.recordId)
    expect(session).toBeDefined()
    expect(session).toMatchObject({
      id: record.recordId,
      protocol: 'TCP',
      localPort: 8080,
      pid: 100,
      processName: 'srv',
      executablePath: '/Users/leiyu/work/srv',
      commandLine: 'srv --port 8080',
      workingDirectory: '/Users/leiyu/work',
      userName: 'leiyu',
      applicationName: 'Terminal',
      projectName: 'demo',
      protectionLevel: 'USER',
      firstSeenAt: 1000,
      lastSeenAt: 5000,
      closedAt: undefined
    })
  })

  it('PORT_CHANGED → UPDATE state/last_seen（不新增行）', () => {
    const { store, db } = makeStore()
    const record = mkRecord(8080, 100)
    store.applyDiffEvents([opened(record)], 5000)
    const changed = mkRecord(8080, 100, { state: 'LISTEN', remoteAddress: '10.0.0.2', remotePort: 443 })
    store.applyDiffEvents(
      [{ type: 'PORT_CHANGED', groupKey: 'TCP:127.0.0.1:8080', recordId: changed.recordId, record: changed }],
      7000
    )
    const count = (db.prepare('SELECT COUNT(*) AS n FROM port_session').get() as { n: number }).n
    expect(count).toBe(1)
    const session = store.find(record.recordId)
    expect(session?.lastSeenAt).toBe(7000)
    expect(session?.closedAt).toBeUndefined()
  })

  it('PORT_CLOSED → closed_at 收口；重复收口幂等', () => {
    const { store } = makeStore()
    const record = mkRecord(8080, 100)
    store.applyDiffEvents([opened(record)], 5000)
    store.close(record.recordId, 8000)
    let session = store.find(record.recordId)
    expect(session?.closedAt).toBe(8000)
    // 幂等：重复收口不覆盖 closed_at
    store.close(record.recordId, 9000)
    session = store.find(record.recordId)
    expect(session?.closedAt).toBe(8000)
  })

  it('PROCESS_CHANGED → 旧会话收口 + 新会话 INSERT（prevRecordId）', () => {
    const { store } = makeStore()
    const oldRecord = mkRecord(8080, 100)
    store.applyDiffEvents([opened(oldRecord)], 5000)
    const newRecord = mkRecord(8080, 200)
    store.applyDiffEvents(
      [{
        type: 'PROCESS_CHANGED',
        groupKey: 'TCP:127.0.0.1:8080',
        recordId: newRecord.recordId,
        prevRecordId: oldRecord.recordId,
        record: newRecord
      }],
      9000
    )
    const oldSession = store.find(oldRecord.recordId)
    expect(oldSession?.closedAt).toBe(9000)
    const newSession = store.find(newRecord.recordId)
    expect(newSession?.closedAt).toBeUndefined()
    expect(newSession?.pid).toBe(200)
  })

  it('无事件不写库', () => {
    const { store, db } = makeStore()
    store.applyDiffEvents([], 5000)
    const count = (db.prepare('SELECT COUNT(*) AS n FROM port_session').get() as { n: number }).n
    expect(count).toBe(0)
  })
})

describe('batchTouch（方案 §5.14：60s 节流批量 UPDATE）', () => {
  it('批量刷新未收口会话的 last_seen_at；已收口会话不被触碰', () => {
    const { store } = makeStore()
    const alive = mkRecord(8080, 100)
    const closing = mkRecord(9090, 200)
    store.applyDiffEvents([opened(alive), opened(closing)], 1000)
    store.close(closing.recordId, 2000)
    store.batchTouch([alive, closing], 60_000)
    expect(store.find(alive.recordId)?.lastSeenAt).toBe(60_000)
    // 已收口行 last_seen 不变（仍为收口时刻）
    expect(store.find(closing.recordId)?.lastSeenAt).toBe(2000)
  })
})

describe('会话重开（同 recordId 覆盖，V1 简化口径）', () => {
  it('同端口同 pid 关闭后再开：INSERT OR REPLACE 生成新会话行', () => {
    const { store } = makeStore()
    const record = mkRecord(8080, 100)
    store.applyDiffEvents([opened(record)], 1000)
    store.close(record.recordId, 2000)
    const reopened = mkRecord(8080, 100)
    reopened.timing = { firstSeen: 3000, lastSeen: 3000 }
    store.applyDiffEvents([opened(reopened)], 3000)
    const session = store.find(record.recordId)
    expect(session?.firstSeenAt).toBe(3000)
    expect(session?.closedAt).toBeUndefined()
  })
})
