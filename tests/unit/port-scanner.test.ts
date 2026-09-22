/**
 * 扫描调度器测试（方案 §5.4）：
 * - setTimeout 链防重入（默认 2000ms 周期）；
 * - updateInterval 切 1000/2000/5000ms 实时生效（需求 §19）；
 * - requestRefresh 500ms 去抖、扫描中合并为轮末补扫；
 * - 失败语义：回调携带 error 且继续调度（上一快照保留在 PortManager 内）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortScanner } from '../../src/main/core/port/PortScanner'
import type { PortManager, ScanCycleResult } from '../../src/main/core/port/PortManager'

function okCycle(): ScanCycleResult {
  return {
    events: [],
    error: null,
    records: [],
    stats: { total: 0, tcp: 0, udp: 0, exposed: 0 }
  }
}

function fakeManager(scanCycle: () => Promise<ScanCycleResult>): PortManager {
  return { scanCycle } as unknown as PortManager
}

describe('PortScanner（方案 §5.4）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('start 后立即首轮，并按默认 2000ms 周期调度', async () => {
    const scanCycle = vi.fn(async () => okCycle())
    const onCycle = vi.fn()
    const scanner = new PortScanner(fakeManager(scanCycle), onCycle)
    scanner.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scanCycle).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(scanCycle).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(scanCycle).toHaveBeenCalledTimes(3)
    scanner.stop()
  })

  it('updateInterval 切 1000ms 后按新周期调度（1/2/5s 可配置）', async () => {
    const scanCycle = vi.fn(async () => okCycle())
    const scanner = new PortScanner(fakeManager(scanCycle), () => undefined)
    scanner.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scanCycle).toHaveBeenCalledTimes(1)
    scanner.updateInterval(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(scanCycle).toHaveBeenCalledTimes(2)
    scanner.updateInterval(5000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(scanCycle).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4000)
    expect(scanCycle).toHaveBeenCalledTimes(3)
    scanner.stop()
  })

  it('requestRefresh 经 500ms 去抖立即补扫', async () => {
    const scanCycle = vi.fn(async () => okCycle())
    const scanner = new PortScanner(fakeManager(scanCycle), () => undefined)
    scanner.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scanCycle).toHaveBeenCalledTimes(1)
    scanner.requestRefresh()
    await vi.advanceTimersByTimeAsync(499)
    expect(scanCycle).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(scanCycle).toHaveBeenCalledTimes(2)
    scanner.stop()
  })

  it('刷新触发轮推送全量快照；错误轮回调携带 error 且恢复轮补推快照', async () => {
    let failing = false
    const scanCycle = vi.fn(async (): Promise<ScanCycleResult> => {
      if (failing) {
        return { events: [], error: 'scan failed', records: [], stats: { total: 0, tcp: 0, udp: 0, exposed: 0 } }
      }
      return okCycle()
    })
    const results: Array<{ error: string | null; pushSnapshot: boolean }> = []
    const scanner = new PortScanner(fakeManager(scanCycle), (result) => {
      results.push({ error: result.error, pushSnapshot: result.pushSnapshot })
    })
    scanner.start()
    await vi.advanceTimersByTimeAsync(0)
    // 触发刷新 → 该轮 pushSnapshot=true
    scanner.requestRefresh()
    await vi.advanceTimersByTimeAsync(500)
    expect(results[1]).toMatchObject({ error: null, pushSnapshot: true })
    // 失败轮
    failing = true
    await vi.advanceTimersByTimeAsync(2000)
    expect(results[2]).toMatchObject({ error: 'scan failed' })
    // 恢复轮：pushSnapshot=true（清除 UI 错误态）
    failing = false
    await vi.advanceTimersByTimeAsync(2000)
    expect(results[3]).toMatchObject({ error: null, pushSnapshot: true })
    scanner.stop()
  })

  it('stop 后不再调度', async () => {
    const scanCycle = vi.fn(async () => okCycle())
    const scanner = new PortScanner(fakeManager(scanCycle), () => undefined)
    scanner.start()
    await vi.advanceTimersByTimeAsync(0)
    scanner.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(scanCycle).toHaveBeenCalledTimes(1)
  })
})
