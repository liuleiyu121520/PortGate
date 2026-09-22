/**
 * 扫描调度器（方案 §5.4）：setTimeout 链循环（防重入不重叠）；
 * 周期默认 2000ms，settings 仅允许 1000/2000/5000（需求 §19）；
 * 即时刷新请求 500ms 去抖（扫描中则合并为轮末补扫）；
 * 失败语义：本轮失败保留上一快照并回调 error（上层推 SCAN_ERROR），连续失败由 UI 状态点呈现；
 * 失败恢复后的首轮额外推送全量快照，供 renderer 清除错误态。
 */
import type { ScanInterval } from '../../../shared/types'
import type { PortManager, ScanCycleResult } from './PortManager'

const REFRESH_DEBOUNCE_MS = 500

export interface ScannerCycleResult extends ScanCycleResult {
  /** 本轮是否由即时刷新触发 */
  triggeredByRefresh: boolean
  /** 是否应额外推送全量快照（刷新触发的轮、或失败恢复轮） */
  pushSnapshot: boolean
}

export class PortScanner {
  private timer: ReturnType<typeof setTimeout> | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private disposed = false
  private intervalMs: ScanInterval = 2000
  private refreshPending = false
  private lastCycleFailed = false

  constructor(
    private readonly manager: PortManager,
    private readonly onCycle: (result: ScannerCycleResult) => void
  ) {}

  start(): void {
    this.disposed = false
    this.schedule(0)
  }

  stop(): void {
    this.disposed = true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  /** settings:set 变更扫描周期后调用（仅接受 1000/2000/5000，合法性由契约校验保证） */
  updateInterval(intervalMs: ScanInterval): void {
    this.intervalMs = intervalMs
    if (!this.disposed && !this.running && this.timer !== null) {
      this.schedule(intervalMs)
    }
  }

  /** 即时刷新（port:refresh）：500ms 去抖；扫描中仅置合并标记，本轮结束后补扫 */
  requestRefresh(): void {
    if (this.disposed || this.refreshPending) {
      return
    }
    this.refreshPending = true
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      if (this.disposed) {
        return
      }
      if (this.running) {
        return
      }
      this.refreshPending = false
      void this.runCycle(true)
    }, REFRESH_DEBOUNCE_MS)
  }

  private schedule(delay: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void this.runCycle(false)
    }, delay)
  }

  private async runCycle(triggeredByRefresh: boolean): Promise<void> {
    if (this.running || this.disposed) {
      return
    }
    this.running = true
    let result: ScannerCycleResult
    try {
      const cycle = await this.manager.scanCycle()
      const recovered = this.lastCycleFailed && cycle.error === null
      result = {
        ...cycle,
        triggeredByRefresh,
        pushSnapshot: triggeredByRefresh || recovered
      }
      this.lastCycleFailed = cycle.error !== null
    } finally {
      this.running = false
    }
    this.onCycle(result)
    // 扫描期间到达的刷新请求合并为轮末立即补扫
    if (this.refreshPending && !this.disposed) {
      this.refreshPending = false
      void this.runCycle(true)
      return
    }
    if (!this.disposed) {
      this.schedule(this.intervalMs)
    }
  }
}
