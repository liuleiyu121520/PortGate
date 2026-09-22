/**
 * 端口 store（方案 §7 阶段 2：renderer 接 port:events 局部更新，不整表刷新）。
 * - 首载经 port:list 拉全量快照，之后完全由 port:events 驱动；
 * - SNAPSHOT → 全量替换；DIFF → 按事件增删改（CLOSED 移除 / PROCESS_CHANGED 先删旧再插新）；
 * - stats 以同口径本地重算（与 src/main/core/port/exposure.ts 一致：非回环即 Exposed）；
 * - SCAN_ERROR 置错误态，收到任何成功事件（SNAPSHOT/DIFF）即清除（失败恢复轮主进程会补推快照）。
 */
import { defineStore } from 'pinia'
import type { DiffEvent, PortEvent, PortRecord, PortStats } from '../../shared/types'

interface PortsState {
  records: PortRecord[]
  stats: PortStats
  scanError: string | null
  ready: boolean
}

function recomputeStats(records: readonly PortRecord[]): PortStats {
  let tcp = 0
  let udp = 0
  let exposed = 0
  for (const record of records) {
    if (record.protocol === 'TCP') {
      tcp += 1
    } else {
      udp += 1
    }
    if (record.localAddress !== '127.0.0.1' && record.localAddress !== '::1') {
      exposed += 1
    }
  }
  return { total: records.length, tcp, udp, exposed }
}

/** 与主进程 MemoryStore.list() 同口径的稳定排序（端口升序 → 协议 → recordId） */
function sortRecords(records: PortRecord[]): void {
  records.sort((a, b) => {
    if (a.localPort !== b.localPort) {
      return a.localPort - b.localPort
    }
    if (a.protocol !== b.protocol) {
      return a.protocol.localeCompare(b.protocol)
    }
    return a.recordId.localeCompare(b.recordId)
  })
}

/** 事件订阅退订句柄（模块级持有，避免 pinia state 序列化函数） */
let unsubscribeEvents: (() => void) | null = null

export const usePortsStore = defineStore('ports', {
  state: (): PortsState => ({
    records: [],
    stats: { total: 0, tcp: 0, udp: 0, exposed: 0 },
    scanError: null,
    ready: false
  }),
  actions: {
    /** 首载：拉全量快照 + 订阅推送（幂等；重复调用先退订旧订阅） */
    async init(): Promise<void> {
      const snapshot = await window.portgate.getPortList()
      this.records = snapshot.records
      this.stats = snapshot.stats
      sortRecords(this.records)
      this.ready = true
      this.resubscribe()
    },
    resubscribe(): void {
      if (unsubscribeEvents !== null) {
        unsubscribeEvents()
      }
      unsubscribeEvents = window.portgate.onPortEvents((event: PortEvent) =>
        this.applyEvent(event)
      )
    },
    applyEvent(event: PortEvent): void {
      if (event.type === 'SNAPSHOT') {
        this.records = event.payload.records
        this.stats = event.payload.stats
        sortRecords(this.records)
        this.scanError = null
        return
      }
      if (event.type === 'SCAN_ERROR') {
        this.scanError = event.payload.message
        return
      }
      // DIFF：局部更新（不整表刷新，§19）
      for (const diffEvent of event.payload.events) {
        this.applyDiffEvent(diffEvent)
      }
      sortRecords(this.records)
      this.stats = recomputeStats(this.records)
      this.scanError = null
    },
    applyDiffEvent(event: DiffEvent): void {
      if (event.type === 'PORT_CLOSED') {
        this.records = this.records.filter((record) => record.recordId !== event.recordId)
        return
      }
      if (event.prevRecordId !== undefined && event.prevRecordId !== event.recordId) {
        this.records = this.records.filter((record) => record.recordId !== event.prevRecordId)
      }
      const index = this.records.findIndex((record) => record.recordId === event.recordId)
      if (index >= 0) {
        this.records[index] = event.record
      } else {
        this.records.push(event.record)
      }
    }
  }
})
