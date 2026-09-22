/**
 * 暴露状态判定与统计条计数（需求 §7 / 方案 §5.13，AC-07）：
 * - local：localAddress ∈ {127.0.0.1, ::1}（回环）；
 * - exposed：其余全部（含 wildcard {0.0.0.0, ::, *} 与绑定具体网卡 IP）——
 *   需求 §7 口径「Exposed 代表监听了非回环地址，不等于一定可以从公网访问」。
 * 纯函数；renderer 侧统计以同口径本地重算（stores/ports.ts），主进程为唯一权威源。
 */
import type { PortRecord, PortStats } from '../../../shared/types'

const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set(['127.0.0.1', '::1'])

/** 需求 §7 明示的 wildcard 集合（探测输出中的 `*` 通配地址归 Exposed） */
export const WILDCARD_ADDRESSES: ReadonlySet<string> = new Set(['0.0.0.0', '::', '*'])

export type Exposure = 'local' | 'exposed'

export function computeExposure(localAddress: string): Exposure {
  return LOOPBACK_ADDRESSES.has(localAddress) ? 'local' : 'exposed'
}

/** 统计条计数（需求 §3：N Ports · TCP x · UDP y · Exposed z） */
export function computeStats(records: readonly PortRecord[]): PortStats {
  let tcp = 0
  let udp = 0
  let exposed = 0
  for (const record of records) {
    if (record.protocol === 'TCP') {
      tcp += 1
    } else {
      udp += 1
    }
    if (computeExposure(record.localAddress) === 'exposed') {
      exposed += 1
    }
  }
  return { total: records.length, tcp, udp, exposed }
}
