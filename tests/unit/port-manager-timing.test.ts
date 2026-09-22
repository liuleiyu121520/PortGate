/**
 * PortManager timing 组装用例（v1.4 MINOR-R4-001 落点）：
 * fake adapter 两轮扫描——同端口记录 firstSeen 不变、lastSeen 随扫描时钟递增；
 * 60s 节流批量 touch：间隔内不触发、到达间隔触发一次（单事务语义由 SessionStore 测试覆盖）。
 */
import { describe, expect, it, vi } from 'vitest'
import type { RawPort, RawProcess } from '../../src/main/platform/types'
import { PortManager } from '../../src/main/core/port/PortManager'
import { ProcessResolver } from '../../src/main/core/resolve/ProcessResolver'
import type { SessionStore } from '../../src/main/core/store/SessionStore'

function fakeAdapter(ports: RawPort[]): {
  scanPorts: ReturnType<typeof vi.fn>
  getProcessTable: ReturnType<typeof vi.fn>
  getWorkingDirectories: ReturnType<typeof vi.fn>
  adapter: import('../../src/main/platform/types').PlatformAdapter
} {
  const table: RawProcess[] = [
    { pid: 100, ppid: 1, uid: 501, user: 'leiyu', startedAt: 500, cpuPercent: 1, memPercent: 1, executablePath: '/Users/leiyu/work/srv', commandLine: 'srv' }
  ]
  const scanPorts = vi.fn(async () => ports)
  const getProcessTable = vi.fn(async () => table)
  const getWorkingDirectories = vi.fn(async () => new Map([[100, '/Users/leiyu/work']]))
  const adapter = {
    scanPorts: async () => (await scanPorts()) as RawPort[],
    getProcessTable: async () => (await getProcessTable()) as RawProcess[],
    getWorkingDirectories: async () => (await getWorkingDirectories()) as Map<number, string>,
    getProcess: async () => null,
    getProcessTree: async () => [],
    terminateProcess: async () => undefined
  }
  return { scanPorts, getProcessTable, getWorkingDirectories, adapter }
}

const PORTS: RawPort[] = [
  {
    pid: 100,
    command: 'srv',
    protocol: 'TCP',
    localAddress: '127.0.0.1',
    localPort: 8080,
    remoteAddress: null,
    remotePort: null,
    state: 'LISTEN'
  }
]

describe('timing 组装（v1.4 MINOR-R4-001）', () => {
  it('两轮扫描：同端口记录 firstSeen 不变、lastSeen 随时钟递增', async () => {
    let now = 10_000
    const nowFn = () => now
    const fakes = fakeAdapter(PORTS)
    const manager = new PortManager(fakes.adapter, new ProcessResolver(), {}, { nowFn })

    const cycle1 = await manager.scanCycle()
    expect(cycle1.error).toBeNull()
    const record1 = cycle1.records.find((record) => record.localPort === 8080)
    expect(record1?.timing.firstSeen).toBe(10_000)
    expect(record1?.timing.lastSeen).toBe(10_000)

    now = 12_000
    const cycle2 = await manager.scanCycle()
    const record2 = cycle2.records.find((record) => record.localPort === 8080)
    expect(record2?.recordId).toBe(record1?.recordId)
    // firstSeen 继承（First Seen = PortGate 第一次检测到该端口，需求 §6）
    expect(record2?.timing.firstSeen).toBe(10_000)
    // lastSeen 递增（Last Seen = 最近一次确认端口仍存在）
    expect(record2?.timing.lastSeen).toBe(12_000)
    expect(record2!.timing.lastSeen).toBeGreaterThan(record1!.timing.lastSeen)
  })

  it('端口消失后再出现：视为新会话，firstSeen 重置', async () => {
    let now = 10_000
    const nowFn = () => now
    const fakes = fakeAdapter(PORTS)
    const manager = new PortManager(fakes.adapter, new ProcessResolver(), {}, { nowFn })
    await manager.scanCycle()
    fakes.scanPorts.mockImplementationOnce(async () => [])
    await manager.scanCycle()
    now = 60_000
    const cycle3 = await manager.scanCycle()
    const record3 = cycle3.records.find((record) => record.localPort === 8080)
    expect(record3?.timing.firstSeen).toBe(60_000)
  })
})

describe('last_seen 60s 节流批量 touch（方案 §5.14）', () => {
  it('间隔内不触发；到达 60s 触发一次并重置节流窗口', async () => {
    let now = 100_000
    const nowFn = () => now
    const fakes = fakeAdapter(PORTS)
    const touchSpy = vi.fn()
    const sessionStore = { batchTouch: touchSpy, applyDiffEvents: vi.fn() } as unknown as SessionStore
    const manager = new PortManager(fakes.adapter, new ProcessResolver(), {}, {
      nowFn,
      sessionStore,
      touchIntervalMs: 60_000
    })

    // 首轮：lastTouchAt=0 → now-lastTouch >= 60s → 触发
    await manager.scanCycle()
    expect(touchSpy).toHaveBeenCalledTimes(1)
    expect(touchSpy.mock.calls[0]?.[1]).toBe(100_000)

    // 12s 后第二轮：窗口内不触发
    now = 112_000
    await manager.scanCycle()
    expect(touchSpy).toHaveBeenCalledTimes(1)

    // 到达 172s（距上次 touch 60s）：触发一次
    now = 172_000
    await manager.scanCycle()
    expect(touchSpy).toHaveBeenCalledTimes(2)
    // 批量内容为当前存续记录
    expect(touchSpy.mock.calls[1]?.[0]).toHaveLength(1)
    expect(touchSpy.mock.calls[1]?.[1]).toBe(172_000)
  })

  it('未提供 sessionStore 时不触发 touch（纯内存模式）', async () => {
    const fakes = fakeAdapter(PORTS)
    const manager = new PortManager(fakes.adapter, new ProcessResolver())
    const cycle = await manager.scanCycle()
    expect(cycle.error).toBeNull()
  })
})
