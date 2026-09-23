/**
 * 界面文案常量表（UI 重构方案 §8，D-UI-06 / UI-AC-22 单一来源；v1.2 双语标注规则）：
 * - `BilingualLabel { en, cn | null }`：数据指标类标签双语对——EN 主行（形态不改写：表头/分区
 *   标题大写、dt 字段标签原样大小写），CN 辅助行 11px/400 --pg-muted（§4.5 双语辅助行定档）；
 *   `cn: null` = 豁免中文（白名单恒等：仅 TCP/UDP/CPU，§8.2/§8.5-1）；
 * - `COPY`：纯中文保留域字符串（控件与状态文案，需求 §6-1 不变：按钮/Tab/状态/空态/tooltip/
 *   弹窗/横幅/品牌名），双语域字符串一律不入此表；
 * - 六组双语定名表（§8.2 + 主理人裁定）：TABLE_COLUMNS 6 / HISTORY_COLUMNS 4 / STATS_LABELS 4 /
 *   DRAWER_SECTIONS 5 / DRAWER_FIELDS 20（含首区 Application 应用 / Project 项目）/ SETTINGS；
 * - 扫描周期选项值维持「1 秒 / 2 秒 / 5 秒」（MINOR-UIR3-004 主理人裁定，纯中文保留域）；
 * - 技术标识符英文原样不改大小写（TCP/UDP/PID/PPID/LISTEN/⌘K/Exposed/Local/保护级值）；
 * - 中点 `·` 仅用于并列同类短元数据；格式规则只约束 UI 自产文案，数据原值不作字符替换。
 */
import type { ScanInterval } from '../shared/types'

/** 双语标签（v1.2）：en 主行（形态不改写）；cn 辅助行，null = 豁免中文（白名单域） */
export interface BilingualLabel {
  en: string
  cn: string | null
}

/** 分隔符常量（§8.1/§8.3） */
export const SEP = {
  DOT: '·',
  ARROW: '→',
  ELLIPSIS: '…'
} as const

/** 纯中文保留域（控件与状态文案）+ 品牌名/技术记号 */
export const COPY = {
  header: {
    title: 'PortGate · 端口门禁',
    monitoring: '监控中',
    scanFailed: '扫描失败',
    settingsLabel: '设置',
    themeLight: '浅色',
    themeDark: '深色'
  },
  banner: {
    title: '当前平台适配开发中',
    description: 'Windows / Linux Adapter 的完整功能将在后续版本提供（界面与历史可浏览，扫描与安全终止暂不可用）。'
  },
  search: {
    placeholder: '搜索端口、PID、进程、应用、项目、路径、命令…',
    clearLabel: '清空搜索',
    kbd: '⌘K'
  },
  table: {
    pidLabel: 'PID',
    emptyValue: '—'
  },
  tabs: {
    current: '当前',
    history: '历史'
  },
  actions: {
    terminate: '结束',
    terminateProcess: '结束进程',
    forceTerminate: '强制结束',
    cancel: '取消',
    copyCommand: '复制命令',
    openProjectDir: '打开项目目录'
  },
  drawer: {
    title: '端口详情',
    exposureLocal: 'Local · 仅本机',
    exposureExposed: 'Exposed · 对外监听',
    hint: '对外监听 ≠ 公网可达；终止仅对 USER 级进程放行，主进程全量校验防 PID 复用。'
  },
  empty: {
    current: '暂无监听端口',
    search: '没有匹配的结果',
    searchHint: '试试其他关键词或清空搜索',
    history: '暂无历史会话'
  },
  tooltips: {
    protected: '系统进程，受保护（{level}），禁止结束'
  },
  messages: {
    terminateTitle: '结束进程',
    terminateContent: '{process} · {protocol} {port}（PID {pid}），确认结束该进程？',
    forceTitle: '进程未响应 SIGTERM',
    forceContent: '{process} 未响应正常终止，是否强制结束（SIGKILL）？',
    terminated: '进程已结束',
    alreadyExited: '进程已退出',
    forced: '已强制结束',
    copied: '命令已复制',
    copyFailed: '复制失败',
    revealFailed: '打开目录失败（路径不存在或已失效）',
    denyRecordGone: '记录已消失，请刷新后重试',
    denyPidReuse: '进程身份已变化（PID 复用防护已拦截），已拒绝终止',
    denyProtected: '系统进程，受保护（{level}），禁止结束',
    denyGeneric: '终止被拒绝',
    terminateFailed: '终止失败：{detail}',
    unknownError: '未知错误'
  }
} as const

/** 列定义（label 双语 + key + 可选固定宽度；§5.4 v1.2） */
export interface BilingualColumnDef {
  key: string
  label: BilingualLabel
  /** 固定宽度列（table-layout: fixed 下交给 colgroup；弹性列不设宽度） */
  width?: number
  /** 最小宽度意图（§5.4 进程列 min 220px 弹性；antd 无 minWidth，fixed 布局下由弹性分配保证） */
  minWidth?: number
}

/**
 * 当前表列定名（§8.2 表头 6 对；PROJECT 列并入进程列，D-UI-04）：
 * PORT 端口 140｜PROCESS 进程 min 220 弹性｜APP 应用 140｜ADDRESS 地址 弹性｜UPTIME 运行时长 96｜ACTION 操作 88。
 * 端口列 140 为锁定实现（MINOR-UIR3-003）：5 位数端口 + 协议 + 对外标识单行不截断。
 */
export const TABLE_COLUMNS: BilingualColumnDef[] = [
  { key: 'port', label: { en: 'PORT', cn: '端口' }, width: 140 },
  { key: 'process', label: { en: 'PROCESS', cn: '进程' }, minWidth: 220 },
  { key: 'app', label: { en: 'APP', cn: '应用' }, width: 140 },
  { key: 'address', label: { en: 'ADDRESS', cn: '地址' } },
  { key: 'uptime', label: { en: 'UPTIME', cn: '运行时长' }, width: 96 },
  { key: 'action', label: { en: 'ACTION', cn: '操作' }, width: 88 }
]

/** 历史表列定名（§8.2 历史表头 4 对；PROJECT 并入进程列）：端口｜进程（含 project 次要文本）｜时间区间｜时长 */
export const HISTORY_COLUMNS: BilingualColumnDef[] = [
  { key: 'port', label: { en: 'PORT', cn: '端口' }, width: 120 },
  { key: 'process', label: { en: 'PROCESS', cn: '进程' }, minWidth: 220 },
  { key: 'interval', label: { en: 'INTERVAL', cn: '时间区间' }, width: 150 },
  { key: 'duration', label: { en: 'DURATION', cn: '时长' }, width: 96 }
]

/** 统计条双语标签（§8.2 统计 4 对，2 豁免）：Ports 端口数 ｜ TCP（豁免）｜ UDP（豁免）｜ Exposed 对外 */
export const STATS_LABELS = {
  total: { en: 'Ports', cn: '端口数' },
  tcp: { en: 'TCP', cn: null },
  udp: { en: 'UDP', cn: null },
  exposed: { en: 'Exposed', cn: '对外' }
} satisfies Record<string, BilingualLabel>

/** 抽屉五区双语标题（§8.2；首区 EN 含「 / 」连接，主理人裁定同规则无特例） */
export const DRAWER_SECTIONS = {
  appProject: { en: 'APPLICATION / PROJECT', cn: '应用与项目' },
  network: { en: 'NETWORK', cn: '网络' },
  process: { en: 'PROCESS', cn: '进程' },
  time: { en: 'TIME', cn: '时间' },
  runtime: { en: 'RUNTIME', cn: '运行时' }
} satisfies Record<string, BilingualLabel>

/**
 * 抽屉字段双语标签（§8.2 抽屉字段 18 对 + 主理人裁定 MINOR-UIR3-002 增首区 2 对 = 20 对，1 豁免 CPU）。
 * v1.2 定名：Process Start 进程启动时间 / Uptime 已运行 / First Seen 首次发现 / Last Seen 最近发现 /
 * Port Duration 占用时长（v1.1 旧名 废弃）；PID 进程 ID / PPID 父进程（不豁免，理解增益）。
 */
export const DRAWER_FIELDS = {
  application: { en: 'Application', cn: '应用' },
  project: { en: 'Project', cn: '项目' },
  port: { en: 'Port', cn: '端口' },
  address: { en: 'Address', cn: '地址' },
  protocol: { en: 'Protocol', cn: '协议' },
  state: { en: 'State', cn: '状态' },
  exposure: { en: 'Exposure', cn: '暴露' },
  pid: { en: 'PID', cn: '进程 ID' },
  ppid: { en: 'PPID', cn: '父进程' },
  user: { en: 'User', cn: '用户' },
  executable: { en: 'Executable', cn: '可执行文件' },
  command: { en: 'Command', cn: '命令' },
  workingDir: { en: 'Working Dir', cn: '工作目录' },
  processStart: { en: 'Process Start', cn: '进程启动时间' },
  uptime: { en: 'Uptime', cn: '已运行' },
  portDuration: { en: 'Port Duration', cn: '占用时长' },
  firstSeen: { en: 'First Seen', cn: '首次发现' },
  lastSeen: { en: 'Last Seen', cn: '最近发现' },
  cpu: { en: 'CPU', cn: null },
  memory: { en: 'Memory', cn: '内存' }
} satisfies Record<string, BilingualLabel>

/** 设置组双语（§8.2 设置：Scan Interval 扫描周期；选项值「1 秒/2 秒/5 秒」为纯中文保留域，MINOR-UIR3-004 裁定） */
export const SETTINGS = {
  scanIntervalLabel: { en: 'Scan Interval', cn: '扫描周期' } satisfies BilingualLabel,
  hint: '调整后立即生效，无需重启应用',
  intervalOptions: [
    { value: 1000, label: '1 秒' },
    { value: 2000, label: '2 秒' },
    { value: 5000, label: '5 秒' }
  ] as readonly { value: ScanInterval; label: string }[]
}

/**
 * 表格密度常量（§5.4 行密度定档的源码可测载体）：
 * 行高 = cellPaddingBlock × 2 + lineHeight + rowBorderWidth = 13×2 + 20 + 1 = 47px ∈ 44–60（目标 48 ✓）。
 * App.vue 表格单元格样式的 padding/line-height 与此恒等（app-shell 断言交叉核验）。
 * UI-AC-10 度量对象为数据行；v1.2 双语表头带高约 48px 不在该断言域（§5.4 核定）。
 */
export const TABLE_DENSITY = {
  cellPaddingBlock: 13,
  cellPaddingInline: 12,
  lineHeight: 20,
  rowBorderWidth: 1
} as const

/** 模板填充：`{key}` 占位符替换（未知占位符原样保留，便于发现键位笔误） */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  )
}
