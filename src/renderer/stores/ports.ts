/**
 * 端口 store（阶段 2 数据通路 + 阶段 3 统一搜索）：
 * - 首载经 port:list 拉快照，之后由 port:events 驱动；
 * - 非搜索态（query 空）：DIFF 局部更新（不整表刷新，§19），stats 本地同口径重算；
 * - 搜索态（query 非空）：DIFF 到达后防抖重拉 port:list(query)（主进程 SearchEngine 过滤
 *   排序并附带命中区间 matches）；records 顺序即主进程 score 降序，不本地重排；
 * - stats 恒为主进程全量口径（统计条不随搜索变化，M-01 核对口径）；
 * - SCAN_ERROR 置错误态，成功事件（SNAPSHOT/DIFF/重拉）清除。
 */
import { defineStore } from 'pinia'
import type { DiffEvent, PortEvent, PortListResult, PortRecord, PortStats, SearchMatchInfo } from '../../shared/types'

interface PortsState {
  records: PortRecord[]
  stats: PortStats
  matches: Record<string, SearchMatchInfo>
  query: string
  scanError: string | null
  ready: boolean
}

const QUERY_DEBOUNCE_MS = 250

/** 事件订阅退订句柄（模块级持有，避免 pinia state 序列化函数） */
let unsubscribeEvents: (() => void) | null = null
let queryTimer: ReturnType<typeof setTimeout> | null = null

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

/** 与主进程 MemoryStore.list() 同口径的稳定排序（仅非搜索态使用） */
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

function emptyStats(): PortStats {
  return { total: 0, tcp: 0, udp: 0, exposed: 0 }
}

export const usePortsStore = defineStore('ports', {
  state: (): PortsState => ({
    records: [],
    stats: emptyStats(),
    matches: {},
    query: '',
    scanError: null,
    ready: false
  }),
  actions: {
    /** 首载：拉全量快照 + 订阅推送（幂等；重复调用先退订旧订阅） */
    async init(): Promise<void> {
      await this.reloadForQuery()
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
    /** 搜索输入入口（SearchBar 每次 input 调用；内部防抖合并为一次 port:list 重拉） */
    setQuery(query: string): void {
      this.query = query
      if (queryTimer !== null) {
        clearTimeout(queryTimer)
      }
      queryTimer = setTimeout(() => {
        queryTimer = null
        void this.reloadForQuery()
      }, QUERY_DEBOUNCE_MS)
    },
    /** 按当前 query 重拉 port:list（主进程负责过滤/排序/命中区间） */
    async reloadForQuery(): Promise<void> {
      const snapshot = await window.portgate.getPortList(this.query)
      this.applySnapshot(snapshot)
    },
    applySnapshot(snapshot: PortListResult): void {
      this.records = snapshot.records
      this.stats = snapshot.stats
      this.matches = snapshot.matches
      if (this.query.trim().length === 0) {
        // 非搜索态：主进程已按端口升序，本地保序即可
        sortRecords(this.records)
      }
      this.scanError = null
    },
    /** 搜索态下 DIFF 到达：防抖重拉，合并高频事件（局部更新与搜索结果的交集语义复杂化前，以主进程结果为唯一权威） */
    scheduleQueryReload(): void {
      if (queryTimer !== null) {
        return
      }
      queryTimer = setTimeout(() => {
        queryTimer = null
        void this.reloadForQuery()
      }, QUERY_DEBOUNCE_MS)
    },
    applyEvent(event: PortEvent): void {
      if (event.type === 'SNAPSHOT') {
        if (this.query.trim().length > 0) {
          this.scheduleQueryReload()
          return
        }
        this.records = event.payload.records
        this.stats = event.payload.stats
        this.matches = {}
        sortRecords(this.records)
        this.scanError = null
        return
      }
      if (event.type === 'SCAN_ERROR') {
        this.scanError = event.payload.message
        return
      }
      // DIFF
      if (this.query.trim().length > 0) {
        this.scheduleQueryReload()
        return
      }
      for (const diffEvent of event.payload.events) {
        this.applyDiffEvent(diffEvent)
      }
      sortRecords(this.records)
      this.stats = recomputeStats(this.records)
      this.matches = {}
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
