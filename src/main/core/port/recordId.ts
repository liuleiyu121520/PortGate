/**
 * 记录身份键（方案 §5.1 双层定义）：
 * - recordId = `${protocol}:${localAddress}:${localPort}:${pid}`（进程绑定身份，IPC 维度）；
 * - diff 分组 key = `${protocol}:${localAddress}:${localPort}`（端口身份，识别 PROCESS_CHANGED）。
 */
import type { PortRecord } from '../../../shared/types'

export function buildRecordId(
  protocol: 'TCP' | 'UDP',
  localAddress: string,
  localPort: number,
  pid: number
): string {
  return `${protocol}:${localAddress}:${localPort}:${pid}`
}

export function diffGroupKey(record: Pick<PortRecord, 'protocol' | 'localAddress' | 'localPort'>): string {
  return `${record.protocol}:${record.localAddress}:${record.localPort}`
}
