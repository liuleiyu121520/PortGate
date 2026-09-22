/**
 * 差异引擎（需求 §19 / 方案 §5.5）：纯函数 (prev, next) => DiffEvent[]。
 * - 按端口分组 key（protocol:localAddress:localPort）对齐；
 * - PORT_OPENED：分组 key 新增；PORT_CLOSED：分组 key 消失；
 * - PORT_CHANGED：同 key 同 pid，state/remote 变化；
 * - PROCESS_CHANGED：同 key 的 pid 变化（旧记录让位于新记录，事件载荷携带 prevRecordId）。
 * 事件载荷 record 为事件后相关记录的最新态（CLOSED 为消失前记录，供 renderer 局部更新）。
 */
import type { DiffEvent, PortRecord } from '../../../shared/types'
import { diffGroupKey } from './recordId'

function hasPortStateChanged(prev: PortRecord, next: PortRecord): boolean {
  return (
    prev.state !== next.state ||
    prev.remoteAddress !== next.remoteAddress ||
    prev.remotePort !== next.remotePort
  )
}

export function diffSnapshots(prev: readonly PortRecord[], next: readonly PortRecord[]): DiffEvent[] {
  const events: DiffEvent[] = []
  const prevByKey = new Map<string, PortRecord>(prev.map((record) => [diffGroupKey(record), record]))
  const nextKeys = new Set<string>()

  for (const record of next) {
    const key = diffGroupKey(record)
    nextKeys.add(key)
    const old = prevByKey.get(key)
    if (old === undefined) {
      events.push({ type: 'PORT_OPENED', groupKey: key, recordId: record.recordId, record })
    } else if (old.recordId === record.recordId) {
      if (hasPortStateChanged(old, record)) {
        events.push({ type: 'PORT_CHANGED', groupKey: key, recordId: record.recordId, record })
      }
    } else {
      // 同端口 key、不同 recordId：pid 变化 → 进程更替
      events.push({
        type: 'PROCESS_CHANGED',
        groupKey: key,
        recordId: record.recordId,
        prevRecordId: old.recordId,
        record
      })
    }
  }

  for (const record of prev) {
    const key = diffGroupKey(record)
    if (!nextKeys.has(key)) {
      events.push({ type: 'PORT_CLOSED', groupKey: key, recordId: record.recordId, record })
    }
  }

  return events
}
