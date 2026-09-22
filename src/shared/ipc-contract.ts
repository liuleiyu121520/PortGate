/**
 * IPC 契约层（方案 §4.2 / v1.2 m-05）：
 * - channel 常量与白名单的唯一权威来源；主进程 src/main/ipc/register.ts 是唯一注册点；
 * - 每个 channel 必须以「唯一职责」注释声明互不重叠的职责（契约测试静态断言）；
 * - 阶段 1 仅挂 settings:get / settings:set；port:* / record:* 通道随对应阶段加入白名单，
 *   严禁设置任何占位通道（v1.2 m-01）。
 */
import type {
  ScanInterval,
  SettingsSetResult,
  SettingsSnapshot,
  SettingsUpdateParams,
  ThemeName
} from './types'
import { SCAN_INTERVAL_OPTIONS, THEME_NAMES } from './constants'

export const IPC_CHANNELS = {
  /** 唯一职责：读取应用设置（扫描周期与主题），返回当前生效的设置快照 */
  SETTINGS_GET: 'settings:get',
  /** 唯一职责：写入应用设置（扫描周期仅接受 1000/2000/5000、主题仅接受 light/dark），返回写入结果 */
  SETTINGS_SET: 'settings:set'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/** IPC 白名单（renderer 可达通道全集；preload 桥方法与之一一对应，测试恒等断言） */
export const IPC_CHANNEL_WHITELIST: readonly IpcChannel[] = [
  IPC_CHANNELS.SETTINGS_GET,
  IPC_CHANNELS.SETTINGS_SET
]

/** 单个 channel 的契约元数据（契约测试据此断言职责唯一与入参消费） */
export interface IpcChannelContract {
  channel: IpcChannel
  /** R = renderer→main invoke；P = main→renderer push（阶段 1 全为 R） */
  direction: 'R' | 'P'
  /** 唯一职责描述（与源码注释一致，两两不同 = 职责互不重叠） */
  responsibility: string
  /** 入参字段清单（每个字段必须被 src/main/ipc/register.ts 消费） */
  paramFields: readonly string[]
}

export const IPC_CHANNEL_CONTRACTS: readonly IpcChannelContract[] = [
  {
    channel: IPC_CHANNELS.SETTINGS_GET,
    direction: 'R',
    responsibility: '读取应用设置（扫描周期与主题），返回当前生效的设置快照',
    paramFields: []
  },
  {
    channel: IPC_CHANNELS.SETTINGS_SET,
    direction: 'R',
    responsibility:
      '写入应用设置（扫描周期仅接受 1000/2000/5000、主题仅接受 light/dark），返回写入结果',
    paramFields: ['scanInterval', 'theme']
  }
]

/** settings:set 载荷校验结果 */
export type SettingsUpdateNormalizeResult =
  | { ok: true; value: SettingsUpdateParams }
  | { ok: false; error: string }

/**
 * 校验并归一化 settings:set 入参（契约级校验，主进程 handler 与测试共用）：
 * - 仅接受 scanInterval / theme 两个已知字段，未知字段一律拒绝；
 * - scanInterval 仅接受 1000/2000/5000（方案 §4.2）；theme 仅接受 light/dark；
 * - 至少包含一个有效字段。
 */
export function normalizeSettingsUpdate(raw: unknown): SettingsUpdateNormalizeResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'INVALID_PAYLOAD' }
  }
  const input = raw as Record<string, unknown>
  const value: SettingsUpdateParams = {}
  for (const key of Object.keys(input)) {
    if (key === 'scanInterval') {
      const candidate = input.scanInterval
      if (
        typeof candidate !== 'number' ||
        !(SCAN_INTERVAL_OPTIONS as readonly number[]).includes(candidate)
      ) {
        return { ok: false, error: 'INVALID_SCAN_INTERVAL' }
      }
      value.scanInterval = candidate as ScanInterval
    } else if (key === 'theme') {
      const candidate = input.theme
      if (
        typeof candidate !== 'string' ||
        !(THEME_NAMES as readonly string[]).includes(candidate)
      ) {
        return { ok: false, error: 'INVALID_THEME' }
      }
      value.theme = candidate as ThemeName
    } else {
      return { ok: false, error: `UNKNOWN_FIELD:${key}` }
    }
  }
  if (value.scanInterval === undefined && value.theme === undefined) {
    return { ok: false, error: 'EMPTY_UPDATE' }
  }
  return { ok: true, value }
}

/** window.portgate 暴露的桥 API（preload 实现，renderer 仅经此访问；与白名单一一对应） */
export interface PortgateApi {
  getSettings(): Promise<SettingsSnapshot>
  setSettings(params: SettingsUpdateParams): Promise<SettingsSetResult>
}
