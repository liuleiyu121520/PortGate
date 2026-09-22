/**
 * PortGate 共享类型（方案 §5.1：数据模型按需求 §8 定义）。
 * 阶段 1 仅落设置域类型；PortRecord 等端口数据模型随阶段 2 平台数据通路一并引入，
 * 避免投机定义（方案 §5.14 同款裁量口径）。
 */

/** 扫描周期（需求 §19：仅允许 1000/2000/5000） */
export type ScanInterval = 1000 | 2000 | 5000

/** 主题名（需求 §23：Cloud Slate=light / Midnight Slate=dark） */
export type ThemeName = 'light' | 'dark'

/** 应用设置（主进程持有的完整设置快照） */
export interface AppSettings {
  scanInterval: ScanInterval
  theme: ThemeName
}

/** settings:get 出参（方案 §4.2：{ scanInterval, theme }） */
export type SettingsSnapshot = AppSettings

/** settings:set 入参（方案 §4.2：{ scanInterval?, theme? }） */
export interface SettingsUpdateParams {
  scanInterval?: ScanInterval
  theme?: ThemeName
}

/** settings:set 出参（方案 §4.2：{ ok }） */
export interface SettingsSetResult {
  ok: boolean
}
