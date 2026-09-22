/**
 * SettingsStore 测试（阶段 5，R-05）：settings:get/set 从内存态迁至 SQLite 落库、
 * 重启恢复（新实例读回）、默认值兜底、非法存量值防御。
 */
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from '../../src/main/db/connection'
import { SettingsStore } from '../../src/main/core/store/SettingsStore'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  migrate(db)
  return db
}

const DEFAULTS = { scanInterval: 2000 as const, theme: 'light' as const }

describe('SettingsStore（阶段 5 落库 + 重启恢复）', () => {
  it('默认值：空库返回组装层默认（扫描周期/主题）', () => {
    const db = makeDb()
    try {
      const store = new SettingsStore(db, DEFAULTS)
      expect(store.get()).toEqual({ scanInterval: 2000, theme: 'light' })
    } finally {
      db.close()
    }
  })

  it('update：内存快照生效并立即落库', () => {
    const db = makeDb()
    try {
      const store = new SettingsStore(db, DEFAULTS)
      const after = store.update({ scanInterval: 5000, theme: 'dark' })
      expect(after).toEqual({ scanInterval: 5000, theme: 'dark' })
      const raw = db
        .prepare('SELECT value FROM app_settings WHERE key = ?')
        .get('scanInterval') as { value: string }
      expect(raw.value).toBe('5000')
    } finally {
      db.close()
    }
  })

  it('重启恢复：新实例（同库）读回持久化设置', () => {
    const db = makeDb()
    try {
      const first = new SettingsStore(db, DEFAULTS)
      first.update({ scanInterval: 1000, theme: 'dark' })
      // 模拟重启：新实例、默认值不同（默认 light/2000），读回应为落库值
      const second = new SettingsStore(db, DEFAULTS)
      expect(second.get()).toEqual({ scanInterval: 1000, theme: 'dark' })
    } finally {
      db.close()
    }
  })

  it('部分补丁：只更新提供字段', () => {
    const db = makeDb()
    try {
      const store = new SettingsStore(db, DEFAULTS)
      store.update({ theme: 'dark' })
      expect(store.get()).toEqual({ scanInterval: 2000, theme: 'dark' })
      store.update({ scanInterval: 1000 })
      expect(store.get()).toEqual({ scanInterval: 1000, theme: 'dark' })
    } finally {
      db.close()
    }
  })

  it('存量非法值防御：库中垃圾值被默认值覆盖', () => {
    const db = makeDb()
    try {
      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('scanInterval', '3000')
      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('theme', 'blue')
      const store = new SettingsStore(db, DEFAULTS)
      expect(store.get()).toEqual(DEFAULTS)
    } finally {
      db.close()
    }
  })
})
