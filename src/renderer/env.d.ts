/// <reference types="vite/client" />

import type { PortgateApi } from '../preload/api'

declare global {
  interface Window {
    /** PortGate preload 白名单桥（阶段 1：settings:get / settings:set） */
    portgate: PortgateApi
    /** dev 冒烟探针挂载点（仅 import.meta.env.DEV 下由 main.ts 写入） */
    __portgateDevSmoke?: {
      settings: {
        setTheme: (theme: 'light' | 'dark') => Promise<boolean>
      }
    }
  }
}

export {}
