/**
 * 内存快照存储（方案 §4.1 core/store）：当前端口记录 Map（recordId → PortRecord）。
 * 仅保存当前快照；timing 继承与 SQLite 历史属阶段 5 SessionStore。
 * list() 按端口升序稳定输出（需求 §5.12 空查询默认端口升序口径）。
 */
import type { PortRecord } from '../../../shared/types'

export class MemoryStore {
  private records = new Map<string, PortRecord>()

  /** 以新快照整体替换（timing 已在组装期继承，无需逐条 diff） */
  replaceAll(records: readonly PortRecord[]): void {
    this.records = new Map(records.map((record) => [record.recordId, record]))
  }

  get(recordId: string): PortRecord | undefined {
    return this.records.get(recordId)
  }

  /** 按端口升序、协议次之、recordId 兜底的稳定排序输出 */
  list(): PortRecord[] {
    return [...this.records.values()].sort((a, b) => {
      if (a.localPort !== b.localPort) {
        return a.localPort - b.localPort
      }
      if (a.protocol !== b.protocol) {
        return a.protocol.localeCompare(b.protocol)
      }
      return a.recordId.localeCompare(b.recordId)
    })
  }

  get size(): number {
    return this.records.size
  }
}
