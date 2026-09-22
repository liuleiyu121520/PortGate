/**
 * IPC 契约层（方案 §4.2 / v1.2 m-05）：
 * - channel 常量与白名单的唯一权威来源；主进程 src/main/ipc/register.ts 是 invoke 通道唯一注册点；
 * - 每个 channel 必须以「唯一职责」注释声明互不重叠的职责（契约测试静态断言）；
 * - 阶段 2 白名单：settings:get/set + port:list/detail/refresh/events；
 *   port:terminate/forceTerminate/record:reveal 属阶段 4、port:history 属阶段 5，严禁占位（m-01）。
 */
import type {
  PortListResult,
  PortEvent,
  PortRecord,
  PortRefreshResult,
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
  SETTINGS_SET: 'settings:set',
  /** 唯一职责：拉取当前端口快照全量（records+stats），供 renderer 首载与按需全量刷新，不做历史检索 */
  PORT_LIST: 'port:list',
  /** 唯一职责：按 recordId 查询单条端口记录详情，recordId 不存在时返回 null */
  PORT_DETAIL: 'port:detail',
  /** 唯一职责：请求主进程触发一次去抖立即扫描（500ms 合并），仅返回受理结果不做数据返回 */
  PORT_REFRESH: 'port:refresh',
  /** 唯一职责：主进程向 renderer 推送端口变化（SNAPSHOT/DIFF/SCAN_ERROR 三类事件，renderer 局部更新） */
  PORT_EVENTS: 'port:events'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

/** IPC 白名单（renderer 可达通道全集；preload 桥方法与之一一对应，测试恒等断言） */
export const IPC_CHANNEL_WHITELIST: readonly IpcChannel[] = [
  IPC_CHANNELS.SETTINGS_GET,
  IPC_CHANNELS.SETTINGS_SET,
  IPC_CHANNELS.PORT_LIST,
  IPC_CHANNELS.PORT_DETAIL,
  IPC_CHANNELS.PORT_REFRESH,
  IPC_CHANNELS.PORT_EVENTS
]

/** 单个 channel 的契约元数据（契约测试据此断言职责唯一与入参消费） */
export interface IpcChannelContract {
  channel: IpcChannel
  /** R = renderer→main invoke；P = main→renderer push（方案 §4.2） */
  direction: 'R' | 'P'
  /** 唯一职责描述（与源码注释一致，两两不同 = 职责互不重叠） */
  responsibility: string
  /** 入参字段清单（每个字段必须被 src/main/ipc/register.ts 消费；P 通道无 invoke 入参） */
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
  },
  {
    channel: IPC_CHANNELS.PORT_LIST,
    direction: 'R',
    responsibility: '拉取当前端口快照（records+stats+搜索命中区间），按 query 过滤排序，不做历史检索',
    paramFields: ['query']
  },
  {
    channel: IPC_CHANNELS.PORT_DETAIL,
    direction: 'R',
    responsibility: '按 recordId 查询单条端口记录详情，不存在时返回 null',
    paramFields: ['recordId']
  },
  {
    channel: IPC_CHANNELS.PORT_REFRESH,
    direction: 'R',
    responsibility: '请求触发一次去抖立即扫描（500ms 合并），仅返回受理结果',
    paramFields: []
  },
  {
    channel: IPC_CHANNELS.PORT_EVENTS,
    direction: 'P',
    responsibility: '推送端口变化事件（SNAPSHOT/DIFF/SCAN_ERROR），renderer 据此局部更新不整表刷新',
    paramFields: []
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

/**
 * 校验 port:detail 入参（契约级：recordId 必须是非空字符串）
 */
export function normalizeRecordId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/**
 * 校验 port:list 入参（契约级：{ query?: string }，v1.2 m-05——仅 query，无 tab 参数）。
 * 缺省/非法载荷一律返回空串（= 全量快照）。
 */
export function normalizeListQuery(raw: unknown): string {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return ''
  }
  const query = (raw as Record<string, unknown>).query
  return typeof query === 'string' ? query : ''
}

/** window.portgate 暴露的桥 API（preload 实现，renderer 仅经此访问；与白名单一一对应） */
export interface PortgateApi {
  getSettings(): Promise<SettingsSnapshot>
  setSettings(params: SettingsUpdateParams): Promise<SettingsSetResult>
  /** query 为空串 = 全量快照（端口升序）；非空 = 搜索结果（score 降序） */
  getPortList(query?: string): Promise<PortListResult>
  getPortDetail(recordId: string): Promise<PortRecord | null>
  refreshPorts(): Promise<PortRefreshResult>
  /** 订阅主进程推送（P 通道）；返回退订函数 */
  onPortEvents(listener: (event: PortEvent) => void): () => void
}
