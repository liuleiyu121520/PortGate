/**
 * SettingsStore（方案 §5.14 / 需求 §10.3，R-05）：应用设置落库 app_settings（key-value），
 * 内存快照直读；settings:get/set 从内存态迁移至 SQLite，重启恢复（默认值由组装层提供：
 * 扫描周期取 DEFAULT_SCAN_INTERVAL、主题首次跟随系统 prefers-color-scheme，R-07）。
 */
import type Database from 'better-sqlite3'
import type { AppSettings, SettingsSnapshot, SettingsUpdateParams } from '../../../shared/types'

const KEY_SCAN_INTERVAL = 'scanInterval'
const KEY_THEME = 'theme'

export class SettingsStore {
  private snapshot: AppSettings
  private readonly db: Database.Database

  constructor(db: Database.Database, defaults: AppSettings) {
    this.db = db
    this.snapshot = { ...defaults, ...this.readStored() }
  }

  get(): SettingsSnapshot {
    return { ...this.snapshot }
  }

  /** 契约校验通过后的合法补丁：更新内存快照并立即落库（单事务） */
  update(patch: SettingsUpdateParams): SettingsSnapshot {
    if (patch.scanInterval !== undefined) {
      this.snapshot.scanInterval = patch.scanInterval
    }
    if (patch.theme !== undefined) {
      this.snapshot.theme = patch.theme
    }
    this.persist()
    return this.get()
  }

  private readStored(): Partial<AppSettings> {
    try {
      const rows = this.db
        .prepare('SELECT key, value FROM app_settings WHERE key IN (?, ?)')
        .all(KEY_SCAN_INTERVAL, KEY_THEME) as Array<{ key: string; value: string }>
      const stored: Partial<AppSettings> = {}
      for (const row of rows) {
        if (row.key === KEY_SCAN_INTERVAL) {
          const interval = Number.parseInt(row.value, 10)
          if (interval === 1000 || interval === 2000 || interval === 5000) {
            stored.scanInterval = interval
          }
        } else if (row.key === KEY_THEME) {
          if (row.value === 'light' || row.value === 'dark') {
            stored.theme = row.value
          }
        }
      }
      return stored
    } catch {
      return {}
    }
  }

  private persist(): void {
    const upsert = this.db.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    this.db.transaction(() => {
      upsert.run(KEY_SCAN_INTERVAL, String(this.snapshot.scanInterval))
      upsert.run(KEY_THEME, this.snapshot.theme)
    })()
  }
}
