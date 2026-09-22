/**
 * DiffEngine 测试（需求 §19 / 方案 §5.5）：
 * 四类事件（OPENED/CLOSED/CHANGED/PROCESS_CHANGED）、分组键 protocol:localAddress:localPort、
 * recordId/prevRecordId 载荷、同轮混合事件、无变化零事件。
 */
import { describe, expect, it } from 'vitest'
import type { PortRecord } from '../../src/shared/types'
import { diffSnapshots } from '../../src/main/core/port/DiffEngine'

function mkRecord(
  protocol: 'TCP' | 'UDP',
  localAddress: string,
  localPort: number,
  pid: number,
  overrides: Partial<PortRecord> = {}
): PortRecord {
  return {
    recordId: `${protocol}:${localAddress}:${localPort}:${pid}`,
    protocol,
    localAddress,
    localPort,
    pid,
    process: { pid, name: `proc-${pid}` },
    timing: { firstSeen: 1000, lastSeen: 1000 },
    security: { level: 'UNKNOWN' },
    ...overrides
  }
}

describe('四类差异事件（§19）', () => {
  it('分组 key 新增 → PORT_OPENED', () => {
    const next = [mkRecord('TCP', '127.0.0.1', 5173, 100)]
    const events = diffSnapshots([], next)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'PORT_OPENED',
      groupKey: 'TCP:127.0.0.1:5173',
      recordId: 'TCP:127.0.0.1:5173:100'
    })
  })

  it('分组 key 消失 → PORT_CLOSED（载荷携带消失前记录）', () => {
    const prev = [mkRecord('TCP', '127.0.0.1', 5173, 100)]
    const events = diffSnapshots(prev, [])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('PORT_CLOSED')
    expect(events[0].recordId).toBe('TCP:127.0.0.1:5173:100')
    expect(events[0].record.localPort).toBe(5173)
  })

  it('同 key 同 pid，state/remote 变化 → PORT_CHANGED', () => {
    const prev = [mkRecord('TCP', '0.0.0.0', 3000, 100, { state: 'LISTEN' })]
    const next = [
      mkRecord('TCP', '0.0.0.0', 3000, 100, {
        state: 'LISTEN',
        remoteAddress: '10.0.0.2',
        remotePort: 5555
      })
    ]
    const events = diffSnapshots(prev, next)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('PORT_CHANGED')
  })

  it('同 key 同 pid 但无实质变化 → 零事件', () => {
    const prev = [mkRecord('TCP', '0.0.0.0', 3000, 100)]
    const next = [mkRecord('TCP', '0.0.0.0', 3000, 100)]
    expect(diffSnapshots(prev, next)).toHaveLength(0)
  })

  it('同 key 不同 pid → PROCESS_CHANGED（携带 prevRecordId）', () => {
    const prev = [mkRecord('TCP', '0.0.0.0', 3000, 100)]
    const next = [mkRecord('TCP', '0.0.0.0', 3000, 200)]
    const events = diffSnapshots(prev, next)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('PROCESS_CHANGED')
    expect(events[0].recordId).toBe('TCP:0.0.0.0:3000:200')
    expect(events[0].prevRecordId).toBe('TCP:0.0.0.0:3000:100')
  })

  it('同一端口 key 的 TCP 与 UDP 是两个独立分组（互不影响）', () => {
    const prev = [mkRecord('TCP', '*', 5353, 100)]
    const next = [
      mkRecord('TCP', '*', 5353, 100),
      mkRecord('UDP', '*', 5353, 100)
    ]
    const events = diffSnapshots(prev, next)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('PORT_OPENED')
    expect(events[0].groupKey).toBe('UDP:*:5353')
  })

  it('同轮混合：一轮内同时产生 OPENED/CLOSED/CHANGED/PROCESS_CHANGED', () => {
    const prev = [
      mkRecord('TCP', '127.0.0.1', 1111, 10),
      mkRecord('TCP', '127.0.0.1', 2222, 20),
      mkRecord('TCP', '127.0.0.1', 3333, 30),
      mkRecord('UDP', '*', 4444, 40)
    ]
    const next = [
      // 1111 关闭（无）
      mkRecord('TCP', '127.0.0.1', 2222, 20, { state: 'LISTEN', remoteAddress: '1.2.3.4', remotePort: 9 }),
      mkRecord('TCP', '127.0.0.1', 3333, 31),
      mkRecord('UDP', '*', 4444, 40),
      mkRecord('TCP', '*', 5555, 50)
    ]
    const events = diffSnapshots(prev, next)
    const types = events.map((e) => e.type).sort()
    expect(types).toEqual(['PORT_CHANGED', 'PORT_CLOSED', 'PORT_OPENED', 'PROCESS_CHANGED'])
  })
})
