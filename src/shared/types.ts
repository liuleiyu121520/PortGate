/**
 * PortGate 共享类型。
 * - 数据模型（PortRecord/ProcessInfo/ApplicationInfo/ProjectInfo）按需求 §8 原样定义（方案 §5.1）；
 * - TimingInfo/SecurityInfo/RuntimeInfo/ContainerInfo 需求 §8 仅在 PortRecord 中引用未给定义块，
 *   按方案 §5.1/§5.14/§5.15 语义最小定义；
 * - 设置域类型（阶段 1）保持不变。
 */

/* ---------------------------------- 设置域（阶段 1） ---------------------------------- */

/** 扫描周期（需求 §19：仅允许 1000/2000/5000） */
export type ScanInterval = 1000 | 2000 | 5000

/** 主题名（需求 §23：Cloud Slate=light / Midnight Slate=dark） */
export type ThemeName = 'light' | 'dark'

/** 应用设置（主进程持有的完整设置快照） */
export interface AppSettings {
  scanInterval: ScanInterval
  theme: ThemeName
}

/** settings:get 出参（方案 §4.2：{ scanInterval, theme }） */
export type SettingsSnapshot = AppSettings

/** settings:set 入参（方案 §4.2：{ scanInterval?, theme? }） */
export interface SettingsUpdateParams {
  scanInterval?: ScanInterval
  theme?: ThemeName
}

/** settings:set 出参（方案 §4.2：{ ok }） */
export interface SettingsSetResult {
  ok: boolean
}

/* ------------------------------ 核心数据模型（需求 §8） ------------------------------ */

/** 时间字段（需求 §6 语义：firstSeen=First Seen，lastSeen=Last Seen ≠ Last Active） */
export interface TimingInfo {
  firstSeen: number
  lastSeen: number
}

/** 保护级（需求 §16：完整判定规则属阶段 4 SecurityClassifier；阶段 2 组装固定 UNKNOWN） */
export type SecurityLevel = 'USER' | 'SYSTEM' | 'SYSTEM_CRITICAL' | 'UNKNOWN'

export interface SecurityInfo {
  level: SecurityLevel
}

/** 运行时资源占用（方案 §5.15 / R-05：来自 ps 全表，可选增强，不入 AC） */
export interface RuntimeInfo {
  cpuPercent: number
  memPercent: number
}

/** 容器关联（R-04：V1 仅尽力关联，阶段 4 DockerResolver 接入） */
export interface ContainerInfo {
  name?: string
  image?: string
}

/**
 * 进程信息（需求 §8 ProcessInfo 原样；字段位全保留，
 * application/project 阶段 4 Resolver 接入前为 undefined——R-03 字段位保留口径）
 */
export interface ProcessInfo {
  pid: number
  ppid?: number
  name: string
  executablePath?: string
  commandLine?: string
  arguments?: string[]
  workingDirectory?: string
  user?: string
  uid?: number
  architecture?: string
  startedAt?: number
}

/** 应用信息（需求 §8 原样；阶段 4 ApplicationResolver 接入） */
export interface ApplicationInfo {
  name: string
  bundleId?: string
  path?: string
  icon?: string
  sourcePid?: number
}

/** 项目信息（需求 §8 原样；阶段 4 ProjectResolver 接入） */
export interface ProjectInfo {
  name?: string
  path?: string
  type?: string
  marker?: string
}

/**
 * 核心端口记录（需求 §8 PortRecord 原样；其中需求字段 `id` 按方案 §5.1 定名为
 * recordId，复合键：`${protocol}:${localAddress}:${localPort}:${pid}`，进程绑定身份）
 */
export interface PortRecord {
  recordId: string
  protocol: 'TCP' | 'UDP'
  localAddress: string
  localPort: number
  remoteAddress?: string
  remotePort?: number
  state?: string
  pid: number
  process: ProcessInfo
  application?: ApplicationInfo
  project?: ProjectInfo
  container?: ContainerInfo
  timing: TimingInfo
  security: SecurityInfo
  runtime?: RuntimeInfo
}

/** 统计条计数（需求 §3 / 方案 §4.2：{ total, tcp, udp, exposed }，口径同源 exposure.ts） */
export interface PortStats {
  total: number
  tcp: number
  udp: number
  exposed: number
}

/** 高亮区间 [start, end)（end 独占；需求 §4.4：统一由 HighlightText 组件渲染） */
export type HighlightRange = readonly [number, number]

/** 搜索结果附加信息（方案 §5.12：关键词得分 + 各字段命中区间，按 recordId 索引） */
export interface SearchMatchInfo {
  score: number
  highlights: Record<string, HighlightRange[]>
}

/* ------------------------------- IPC 事件与载荷（§19） ------------------------------- */

export type DiffEventType = 'PORT_OPENED' | 'PORT_CLOSED' | 'PORT_CHANGED' | 'PROCESS_CHANGED'

/** 单条差异事件：record 为事件后相关记录的最新态（CLOSED 时为消失前记录，供 renderer 移除） */
export interface DiffEvent {
  type: DiffEventType
  groupKey: string
  recordId: string
  /** PROCESS_CHANGED 时指同端口被替换的旧记录（renderer 先删旧再插新，局部更新不整表刷新） */
  prevRecordId?: string
  record: PortRecord
}

export type PortEventType = 'SNAPSHOT' | 'DIFF' | 'SCAN_ERROR'

export interface PortSnapshotPayload {
  records: PortRecord[]
  stats: PortStats
}

export interface PortDiffPayload {
  events: DiffEvent[]
}

export interface PortScanErrorPayload {
  message: string
}

/** port:events 推送载荷（方案 §4.2：{ type: 'SNAPSHOT'|'DIFF'|'SCAN_ERROR', payload }） */
export type PortEvent =
  | { type: 'SNAPSHOT'; payload: PortSnapshotPayload }
  | { type: 'DIFF'; payload: PortDiffPayload }
  | { type: 'SCAN_ERROR'; payload: PortScanErrorPayload }

/** port:list 出参（方案 §4.2：{ records, stats }，仅当前快照；历史检索一律走 port:history，v1.2 m-05）。
 * stats 恒为当前全量快照统计（不随 query 变化，统计条口径）；matches 为 §5.12 搜索结果附加信息
 * （query 为空时为空对象），承载命中区间供 HighlightText 统一渲染。 */
export interface PortListResult {
  records: PortRecord[]
  stats: PortStats
  matches: Record<string, SearchMatchInfo>
}

/** port:refresh 出参（方案 §4.2：{ ok }，触发一次去抖立即扫描） */
export interface PortRefreshResult {
  ok: boolean
}

/* ------------------------------ 安全结束契约（需求 §15-17） ------------------------------ */

/** 终止状态机终态（方案 §5.11：Renderer 全程只见 recordId 与终态/拒绝原因） */
export type TerminateStatus = 'DONE' | 'DENIED' | 'PENDING_FORCE' | 'FAILED'

export type TerminateDenyReason = 'RECORD_GONE' | 'PID_REUSE' | 'PROTECTED'

export interface TerminateResult {
  recordId: string
  status: TerminateStatus
  denyReason?: TerminateDenyReason
  /** DENIED:PROTECTED 时附保护级（UI 映射 System Protected 文案，需求 §16） */
  protectionLevel?: SecurityLevel
  /** 附加信息：DONE 阶段的 ALREADY_EXITED、FAILED 的错误消息等 */
  detail?: string
}

/** record:reveal 目标（方案 §4.2：'workdir' | 'project'） */
export type RevealTarget = 'workdir' | 'project'
