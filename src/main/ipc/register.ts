/**
 * IPC 白名单唯一注册点（方案 §3.3 / §4.2）。
 * 阶段 2 通道：settings:get/set + port:list/detail/refresh（invoke）+ port:events（P 推送，
 * 由 main 组装层经 services.broadcast 发送）。port:terminate/forceTerminate/record:reveal
 * 属阶段 4、port:history 属阶段 5，未到阶段严禁挂载（m-01）。
 * 设置暂存主进程内存（阶段 5 迁移 SettingsStore 落库）；扫描周期变更实时回调组装层。
 */
import { ipcMain, nativeTheme } from 'electron'
import { DEFAULT_SCAN_INTERVAL } from '../../shared/constants'
import {
  IPC_CHANNELS,
  normalizeListQuery,
  normalizeRecordId,
  normalizeSettingsUpdate
} from '../../shared/ipc-contract'
import type { PortRefreshResult, SettingsSetResult, SettingsSnapshot } from '../../shared/types'

/** 主进程组装层注入的服务面（由 src/main/index.ts 装配） */
export interface PortgateServices {
  /**
   * 当前端口快照（records 已由主进程排序：空 query 端口升序 / 搜索 score 降序；
   * stats 恒为全量口径；matches 附带搜索命中区间）
   */
  listSnapshot: (query?: string) => {
    records: unknown[]
    stats: { total: number; tcp: number; udp: number; exposed: number }
    matches: Record<string, unknown>
  }
  /** 按 recordId 查单条记录；不存在返回 null */
  findRecord: (recordId: string) => unknown
  /** 触发一次去抖立即扫描 */
  requestRefresh: () => void
  /** settings:set 变更扫描周期后实时生效 */
  applyScanInterval: (intervalMs: 1000 | 2000 | 5000) => void
}

const settings: SettingsSnapshot = {
  scanInterval: DEFAULT_SCAN_INTERVAL,
  theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/** 注册白名单内全部 IPC handler；应用生命周期内仅调用一次 */
export function registerIpcHandlers(services: PortgateServices): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsSnapshot => ({ ...settings }))

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, raw: unknown): SettingsSetResult => {
    const result = normalizeSettingsUpdate(raw)
    if (!result.ok) {
      return { ok: false }
    }
    if (result.value.scanInterval !== undefined) {
      settings.scanInterval = result.value.scanInterval
      services.applyScanInterval(result.value.scanInterval)
    }
    if (result.value.theme !== undefined) {
      settings.theme = result.value.theme
    }
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.PORT_LIST, (_event, raw: unknown) =>
    services.listSnapshot(normalizeListQuery(raw))
  )

  ipcMain.handle(IPC_CHANNELS.PORT_DETAIL, (_event, raw: unknown): unknown => {
    const recordId = normalizeRecordId(raw)
    return recordId === null ? null : services.findRecord(recordId)
  })

  ipcMain.handle(IPC_CHANNELS.PORT_REFRESH, (): PortRefreshResult => {
    services.requestRefresh()
    return { ok: true }
  })
}
