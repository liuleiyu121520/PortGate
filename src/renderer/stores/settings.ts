/**
 * 设置 store（阶段 1：主题 + 扫描周期）。
 * 数据源为 preload 白名单桥（settings:get / settings:set）；
 * 持久化落库（app_settings）随阶段 5 SettingsStore 接入。
 */
import { defineStore } from 'pinia'
import { DEFAULT_SCAN_INTERVAL } from '../../shared/constants'
import type { ScanInterval, ThemeName } from '../../shared/types'
import { applyThemeToDocument } from '../theme'

interface SettingsState {
  theme: ThemeName
  scanInterval: ScanInterval
  initialized: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    theme: 'light',
    scanInterval: DEFAULT_SCAN_INTERVAL,
    initialized: false
  }),
  getters: {
    isDark: (state): boolean => state.theme === 'dark'
  },
  actions: {
    /** 启动时拉取主进程设置快照并应用主题（主进程初始主题已跟随系统，R-07） */
    async init(): Promise<void> {
      try {
        const snapshot = await window.portgate.getSettings()
        this.theme = snapshot.theme
        this.scanInterval = snapshot.scanInterval
      } catch {
        // 桥不可用时保持默认浅色，不阻塞壳渲染
        this.theme = 'light'
      } finally {
        applyThemeToDocument(this.theme)
        this.initialized = true
      }
    },
    /** 切换主题：经白名单桥写入主进程，成功后应用到 DOM */
    async setTheme(theme: ThemeName): Promise<boolean> {
      const result = await window.portgate.setSettings({ theme })
      if (result.ok) {
        this.theme = theme
        applyThemeToDocument(theme)
      }
      return result.ok
    }
  }
})
