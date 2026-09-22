import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { createPortgateApi } from './api'
import type { IpcBridge } from './api'

/**
 * IPC 白名单唯一暴露点（方案 §3.2/§4.2）：
 * renderer 仅能见到 PortgateApi 方法（与 src/shared/ipc-contract.ts 白名单一一对应）。
 */
const bridge: IpcBridge = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  subscribe: (channel, listener) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      listener(payload)
    }
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

contextBridge.exposeInMainWorld('portgate', createPortgateApi(bridge))
