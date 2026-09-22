/**
 * Exposure 判定与统计条计数测试（需求 §7 / 方案 §5.13，AC-07）：
 * 127.0.0.1/::1 → Local；0.0.0.0/::/* → Exposed；绑定具体网卡 IP 亦属非回环 → Exposed；
 * stats { total, tcp, udp, exposed } 口径同源（M-01 核对项的计数基础）。
 */
import { describe, expect, it } from 'vitest'
import type { PortRecord } from '../../src/shared/types'
import { computeExposure, computeStats } from '../../src/main/core/port/exposure'

function mkRecord(protocol: 'TCP' | 'UDP', localAddress: string, localPort: number): PortRecord {
  return {
    recordId: `${protocol}:${localAddress}:${localPort}:1`,
    protocol,
    localAddress,
    localPort,
    pid: 1,
    process: { pid: 1, name: 'proc' },
    timing: { firstSeen: 0, lastSeen: 0 },
    security: { level: 'UNKNOWN' }
  }
}

describe('computeExposure（需求 §7）', () => {
  it('回环地址 → local', () => {
    expect(computeExposure('127.0.0.1')).toBe('local')
    expect(computeExposure('::1')).toBe('local')
  })

  it('wildcard 地址 → exposed', () => {
    expect(computeExposure('0.0.0.0')).toBe('exposed')
    expect(computeExposure('::')).toBe('exposed')
    expect(computeExposure('*')).toBe('exposed')
  })

  it('绑定具体网卡 IP（非回环）→ exposed（需求 §7「非回环」口径）', () => {
    expect(computeExposure('192.168.1.5')).toBe('exposed')
  })
})

describe('computeStats（统计条计数，M-01 核对项）', () => {
  it('total/tcp/udp/exposed 分列计数', () => {
    const records = [
      mkRecord('TCP', '127.0.0.1', 5173),
      mkRecord('TCP', '0.0.0.0', 3000),
      mkRecord('TCP', '*', 8080),
      mkRecord('UDP', '*', 5353),
      mkRecord('UDP', '::1', 51820)
    ]
    expect(computeStats(records)).toEqual({ total: 5, tcp: 3, udp: 2, exposed: 3 })
  })

  it('空快照计数全零', () => {
    expect(computeStats([])).toEqual({ total: 0, tcp: 0, udp: 0, exposed: 0 })
  })
})
