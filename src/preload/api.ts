/**
 * preload 桥 API 工厂（与 electron 运行时解耦，供 vitest 白名单断言直接导入）。
 * - 暴露的方法名与 IPC 白名单一一对应（方案 §4.3）；
 * - invoke / subscribe 前做白名单运行时校验，非白名单通道直接拒绝（纵深防御）。
 */
import { IPC_CHANNEL_WHITELIST, IPC_CHANNELS } from '../shared/ipc-contract'
import type { IpcChannel, PortgateApi } from '../shared/ipc-contract'
import type {
  PortEvent,
  PortListResult,
  PortRecord,
  PortRefreshResult,
  SettingsSetResult,
  SettingsSnapshot,
  SettingsUpdateParams
} from '../shared/types'

/** 受控桥入口：preload/index.ts 注入 ipcRenderer.invoke / ipcRenderer.on */
export interface IpcBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  /** 订阅主进程推送（P 通道）；返回退订函数 */
  subscribe(channel: string, listener: (payload: unknown) => void): () => void
}

/** 桥方法 → channel 路由表（测试断言其值集合恒等于白名单） */
export const PORTGATE_METHODS = {
  getSettings: IPC_CHANNELS.SETTINGS_GET,
  setSettings: IPC_CHANNELS.SETTINGS_SET,
  getPortList: IPC_CHANNELS.PORT_LIST,
  getPortDetail: IPC_CHANNELS.PORT_DETAIL,
  refreshPorts: IPC_CHANNELS.PORT_REFRESH,
  onPortEvents: IPC_CHANNELS.PORT_EVENTS
} as const satisfies Record<keyof PortgateApi, IpcChannel>

const WHITELIST_SET: ReadonlySet<string> = new Set<string>(IPC_CHANNEL_WHITELIST)

export function createPortgateApi(bridge: IpcBridge): PortgateApi {
  const guardedInvoke = (channel: string, payload?: unknown): Promise<unknown> => {
    if (!WHITELIST_SET.has(channel)) {
      return Promise.reject(new Error(`[portgate] 非白名单 IPC 通道被拒绝: ${channel}`))
    }
    return bridge.invoke(channel, payload)
  }
  const guardedSubscribe = (
    channel: string,
    listener: (payload: unknown) => void
  ): (() => void) => {
    if (!WHITELIST_SET.has(channel)) {
      throw new Error(`[portgate] 非白名单 IPC 通道被拒绝: ${channel}`)
    }
    return bridge.subscribe(channel, listener)
  }
  return {
    getSettings: () => guardedInvoke(PORTGATE_METHODS.getSettings) as Promise<SettingsSnapshot>,
    setSettings: (params: SettingsUpdateParams) =>
      guardedInvoke(PORTGATE_METHODS.setSettings, params) as Promise<SettingsSetResult>,
    getPortList: () => guardedInvoke(PORTGATE_METHODS.getPortList) as Promise<PortListResult>,
    getPortDetail: (recordId: string) =>
      guardedInvoke(PORTGATE_METHODS.getPortDetail, recordId) as Promise<PortRecord | null>,
    refreshPorts: () =>
      guardedInvoke(PORTGATE_METHODS.refreshPorts) as Promise<PortRefreshResult>,
    onPortEvents: (listener: (event: PortEvent) => void) =>
      guardedSubscribe(PORTGATE_METHODS.onPortEvents, (payload) => listener(payload as PortEvent))
  }
}
