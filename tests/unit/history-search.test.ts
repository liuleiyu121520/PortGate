/**
 * 历史检索测试（方案 §5.12/§7 阶段 5，AC-12）：
 * SQL LIKE 预筛（各关键词 AND、跨拼接字段列）+ 同一 SearchEngine 评分排序；
 * limit 上限；closed_at 倒序；空查询全量；历史 M 计数口径（返回条数）；
 * v1.4 MINOR-R4-003：port:history 出参不含命中区间（高亮仅当前 Tab）。
 */
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { PortRecord } from '../../src/shared/types'
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
    process: { pid, name: 'proc', user: 'leiyu', uid: 501 },
    timing: { firstSeen: 1000, lastSeen: 1000 },
    security: { level: 'USER' },
    ...overrides
  }
}

function makeStore(): SessionStore {
  const db = new Database(':memory:')
  migrate(db)
  return new SessionStore(db)
}

function openAndClose(store: SessionStore, record: PortRecord, openAt: number, closeAt: number): void {
  store.applyDiffEvents(
    [{ type: 'PORT_OPENED', groupKey: `${record.protocol}:${record.localAddress}:${record.localPort}`, recordId: record.recordId, record }],
    openAt
  )
  store.close(record.recordId, closeAt)
}

describe('LIKE 预筛 + 引擎评分排序（§5.12 历史共用）', () => {
  it("搜索 '3000'：Port 精确会话排在 command 包含会话前（权重排序复用）", () => {
    const store = makeStore()
    const portSession = mkRecord(3000, 100)
    portSession.process = { pid: 100, name: 'node', user: 'leiyu', uid: 501 }
    const commandSession = mkRecord(4000, 200)
    commandSession.process = {
      pid: 200,
      name: 'java',
      commandLine: 'java -jar server --port=3000',
      user: 'leiyu',
      uid: 501
    }
    openAndClose(store, portSession, 1000, 2000)
    openAndClose(store, commandSession, 1100, 2100)
    const result = store.queryHistory('3000')
    expect(result.map((session) => session.localPort)).toEqual([3000, 4000])
  })

  it('多关键词 AND：跨字段命中保留，缺一排除', () => {
    const store = makeStore()
    const hit = mkRecord(5173, 300)
    hit.process = { pid: 300, name: 'node', user: 'leiyu', uid: 501 }
    hit.project = { name: 'ci-buddy', path: '/jobs/ci-buddy' }
    const miss = mkRecord(5174, 301)
    miss.process = { pid: 301, name: 'node', user: 'leiyu', uid: 501 }
    miss.project = { name: 'admin-portal' }
    openAndClose(store, hit, 1000, 2000)
    openAndClose(store, miss, 1100, 2100)
    const result = store.queryHistory('node buddy')
    expect(result).toHaveLength(1)
    expect(result[0].localPort).toBe(5173)
  })

  it('仅进行中（未收口）会话不入历史结果', () => {
    const store = makeStore()
    const closed = mkRecord(8080, 100)
    openAndClose(store, closed, 1000, 2000)
    // 未收口：只 OPEN 不 close
    store.applyDiffEvents(
      [{
        type: 'PORT_OPENED',
        groupKey: 'TCP:127.0.0.1:9090:200',
        recordId: 'TCP:127.0.0.1:9090:200',
        record: mkRecord(9090, 200)
      }],
      1500
    )
    const result = store.queryHistory('')
    expect(result.map((session) => session.localPort)).toEqual([8080])
  })

  it('空查询：全部已收口会话按 closed_at 倒序', () => {
    const store = makeStore()
    const first = mkRecord(8080, 100)
    const second = mkRecord(9090, 200)
    openAndClose(store, first, 1000, 3000)
    openAndClose(store, second, 1000, 2000)
    const result = store.queryHistory('')
    expect(result.map((session) => session.localPort)).toEqual([8080, 9090])
  })

  it('limit 生效（倒序截取最近 N 条）', () => {
    const store = makeStore()
    for (let i = 0; i < 5; i++) {
      const record = mkRecord(7000 + i, 100 + i)
      openAndClose(store, record, 1000, 3000 + i)
    }
    const result = store.queryHistory('', 3)
    expect(result).toHaveLength(3)
    expect(result.map((session) => session.closedAt)).toEqual([3004, 3003, 3002])
  })

  it('历史 M 计数口径：M = port:history 返回条数', () => {
    const store = makeStore()
    const closed = mkRecord(8080, 100)
    openAndClose(store, closed, 1000, 2000)
    const sessions = store.queryHistory('')
    const historyCount = sessions.length
    expect(historyCount).toBe(1)
    // 无匹配关键词 → 0
    expect(store.queryHistory('zzz-not-exist').length).toBe(0)
  })
})
