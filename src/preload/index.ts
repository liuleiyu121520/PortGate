import { contextBridge, ipcRenderer } from 'electron'
import { createPortgateApi } from './api'

/**
 * IPC 白名单唯一暴露点（方案 §3.2/§4.2）：
 * renderer 仅能见到 PortgateApi 方法（与 src/shared/ipc-contract.ts 白名单一一对应）。
 */
contextBridge.exposeInMainWorld(
  'portgate',
  createPortgateApi((channel, payload) => ipcRenderer.invoke(channel, payload))
)
