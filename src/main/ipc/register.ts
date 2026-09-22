/**
 * IPC 白名单唯一注册点（方案 §3.3 / §4.2）。
 * 阶段 1 仅注册 settings:get / settings:set；设置暂存主进程内存
 * （阶段 5 迁移 SettingsStore 落库 portgate.db / app_settings）。
 * 初始主题跟随系统 prefers-color-scheme（需求 §23 / R-07）。
 */
import { ipcMain, nativeTheme } from 'electron'
import { DEFAULT_SCAN_INTERVAL } from '../../shared/constants'
import { IPC_CHANNELS, normalizeSettingsUpdate } from '../../shared/ipc-contract'
import type { AppSettings, SettingsSetResult, SettingsSnapshot } from '../../shared/types'

const settings: AppSettings = {
  scanInterval: DEFAULT_SCAN_INTERVAL,
  theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/** 注册白名单内全部 IPC handler；应用生命周期内仅调用一次 */
export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsSnapshot => ({ ...settings }))

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, raw: unknown): SettingsSetResult => {
    const result = normalizeSettingsUpdate(raw)
    if (!result.ok) {
      return { ok: false }
    }
    if (result.value.scanInterval !== undefined) {
      settings.scanInterval = result.value.scanInterval
    }
    if (result.value.theme !== undefined) {
      settings.theme = result.value.theme
    }
    return { ok: true }
  })
}
