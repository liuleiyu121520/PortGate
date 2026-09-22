/**
 * IPC 白名单唯一注册点（方案 §3.3 / §4.2）。
 * 阶段 5 通道：settings:get/set（经 SettingsStore 落库）+ port:list/detail/refresh
 * （invoke）+ port:events（P 推送）+ port:terminate/forceTerminate + record:reveal +
 * port:history（第 10 通道）。设置状态由组装层的 SettingsStore 提供（落库 + 重启恢复）。
 */
import { ipcMain, shell } from 'electron'
import {
  IPC_CHANNELS,
  normalizeHistoryParams,
  normalizeListQuery,
  normalizeRecordId,
  normalizeRevealParams,
  normalizeSettingsUpdate
} from '../../shared/ipc-contract'
import type {
  PortRefreshResult,
  PortSession,
  SettingsSetResult,
  SettingsSnapshot,
  TerminateResult
} from '../../shared/types'

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
  /** 安全终止（KillPolicy 状态机；仅接受 recordId，需求 §15 红线） */
  terminate: (recordId: string) => Promise<TerminateResult>
  /** 强制终止（重新校验后 SIGKILL） */
  forceTerminate: (recordId: string) => Promise<TerminateResult>
  /** 当前设置快照（SettingsStore：SQLite 落库 + 重启恢复） */
  getSettings: () => SettingsSnapshot
  /** settings:set 契约校验通过后持久化补丁（内存快照 + app_settings 落库） */
  persistSettings: (patch: { scanInterval?: 1000 | 2000 | 5000; theme?: 'light' | 'dark' }) => void
  /** 历史会话检索（LIKE 预筛 + 引擎评分；仅已收口会话） */
  history: (params: { query: string; limit: number }) => PortSession[]
}

/** 注册白名单内全部 IPC handler；应用生命周期内仅调用一次 */
export function registerIpcHandlers(services: PortgateServices): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsSnapshot => services.getSettings())

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, raw: unknown): SettingsSetResult => {
    const result = normalizeSettingsUpdate(raw)
    if (!result.ok) {
      return { ok: false }
    }
    services.persistSettings(result.value)
    if (result.value.scanInterval !== undefined) {
      services.applyScanInterval(result.value.scanInterval)
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

  // 安全终止（需求 §15：terminate(recordId) 形态；主进程全量校验后才执行，拒绝原因回传）
  ipcMain.handle(IPC_CHANNELS.PORT_TERMINATE, async (_event, raw: unknown): Promise<TerminateResult> => {
    const recordId = normalizeRecordId(raw)
    return recordId === null
      ? { recordId: '', status: 'DENIED', denyReason: 'RECORD_GONE' }
      : services.terminate(recordId)
  })

  // 强制终止（需求 §17：重新全量校验后 SIGKILL）
  ipcMain.handle(IPC_CHANNELS.PORT_FORCE_TERMINATE, async (_event, raw: unknown): Promise<TerminateResult> => {
    const recordId = normalizeRecordId(raw)
    return recordId === null
      ? { recordId: '', status: 'DENIED', denyReason: 'RECORD_GONE' }
      : services.forceTerminate(recordId)
  })

  // 打开项目/工作目录（方案 §4.2：main 校验 recordId 存在且路径归属后才 openPath，不接受任意路径）
  ipcMain.handle(IPC_CHANNELS.RECORD_REVEAL, async (_event, raw: unknown): Promise<{ ok: boolean }> => {
    const params = normalizeRevealParams(raw)
    if (params === null) {
      return { ok: false }
    }
    const record = services.findRecord(params.recordId)
    if (record === null || typeof record !== 'object') {
      return { ok: false }
    }
    const candidate = record as {
      process?: { workingDirectory?: string }
      project?: { path?: string }
    }
    const targetPath =
      params.target === 'workdir' ? candidate.process?.workingDirectory : candidate.project?.path
    if (targetPath === undefined || targetPath.length === 0) {
      return { ok: false }
    }
    await shell.openPath(targetPath)
    return { ok: true }
  })

  // 历史会话检索（阶段 5：LIKE 预筛 + 引擎评分；仅已收口会话，出参不含命中区间）
  ipcMain.handle(IPC_CHANNELS.PORT_HISTORY, (_event, raw: unknown): PortSession[] =>
    services.history(normalizeHistoryParams(raw))
  )
}
