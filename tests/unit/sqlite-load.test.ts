/**
 * D-1 判据 B（方案 §11 / §7 阶段 5 开工前置）：vitest（Node 运行时）侧
 * better-sqlite3 包内 N-API 预编译加载 smoke——建内存库、建表、写入、读回校验。
 * 双侧判据中的 B 侧；A 侧（Electron 主进程）已由 connection.ts 接管（[db] 启动日志）。
 */
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrate, openDatabase } from '../../src/main/db/connection'

describe('D-1 判据 B：vitest 侧 better-sqlite3 加载 smoke', () => {
  it('Node 运行时加载并完成建表/插入/读回', () => {
    const db = new Database(':memory:')
    try {
      db.exec('CREATE TABLE d1b_smoke (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
      db.prepare('INSERT INTO d1b_smoke (id, value) VALUES (1, ?)').run('portgate-d1b')
      const row = db.prepare('SELECT id, value FROM d1b_smoke WHERE id = 1').get()
      expect(row).toEqual({ id: 1, value: 'portgate-d1b' })
    } finally {
      db.close()
    }
  })

  it('WAL 模式可用（文件库；与主进程同口径。:memory: 库不支持 WAL）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pg-d1b-'))
    try {
      const db = openDatabase(join(dir, 'test.db'))
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('connection.migrate：port_session 与 app_settings 建表且幂等（重复迁移安全）', () => {
    const db = new Database(':memory:')
    try {
      migrate(db)
      migrate(db)
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
      ).map((row) => row.name)
      expect(tables).toContain('port_session')
      expect(tables).toContain('app_settings')
      expect(db.pragma('user_version', { simple: true })).toBe(1)
    } finally {
      db.close()
    }
  })

  it('connection.openDatabase：返回已迁移的可写库', () => {
    const db = openDatabase(':memory:')
    try {
      db.prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?)'
      ).run('theme', 'dark')
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('theme') as {
        value: string
      }
      expect(row.value).toBe('dark')
    } finally {
      db.close()
    }
  })
})
