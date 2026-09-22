/**
 * preload 桥 API 工厂（与 electron 运行时解耦，供 vitest 白名单断言直接导入）。
 * - 暴露的方法名与 IPC 白名单一一对应（方案 §4.3）；
 * - invoke 前做白名单运行时校验，非白名单通道直接拒绝（纵深防御）。
 */
import { IPC_CHANNEL_WHITELIST, IPC_CHANNELS } from '../shared/ipc-contract'
import type { IpcChannel, PortgateApi } from '../shared/ipc-contract'
import type { SettingsSetResult, SettingsSnapshot, SettingsUpdateParams } from '../shared/types'

/** 桥方法 → channel 路由表（测试断言其值集合恒等于白名单） */
export const PORTGATE_METHODS = {
  getSettings: IPC_CHANNELS.SETTINGS_GET,
  setSettings: IPC_CHANNELS.SETTINGS_SET
} as const satisfies Record<keyof PortgateApi, IpcChannel>

/** 受控 invoke 入口：preload/index.ts 注入 ipcRenderer.invoke，测试注入 stub */
export type IpcInvoker = (channel: string, payload?: unknown) => Promise<unknown>

const WHITELIST_SET: ReadonlySet<string> = new Set<string>(IPC_CHANNEL_WHITELIST)

export function createPortgateApi(invoke: IpcInvoker): PortgateApi {
  const guardedInvoke = (channel: string, payload?: unknown): Promise<unknown> => {
    if (!WHITELIST_SET.has(channel)) {
      return Promise.reject(new Error(`[portgate] 非白名单 IPC 通道被拒绝: ${channel}`))
    }
    return invoke(channel, payload)
  }
  return {
    getSettings: () => guardedInvoke(PORTGATE_METHODS.getSettings) as Promise<SettingsSnapshot>,
    setSettings: (params: SettingsUpdateParams) =>
      guardedInvoke(PORTGATE_METHODS.setSettings, params) as Promise<SettingsSetResult>
  }
}
