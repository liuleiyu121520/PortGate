/**
 * 界面文案常量表（UI 重构方案 §8，D-UI-06 / UI-AC-22 单一来源）：
 * 全部界面字符串 / 列定义 / 分隔符 / 表格密度常量入表，组件模板一律引用常量、禁止散落字面量
 * （copy-contract 断言模板块旧形态零命中）。
 * - 技术标识符英文原样、不改大小写：TCP / UDP / PID / PPID / LISTEN / SIGTERM / SIGKILL /
 *   Exposed / Local / ⌘K / USER / SYSTEM / SYSTEM_CRITICAL / UNKNOWN（保护级值）；
 * - 「PortGate · 端口门禁」为产品名豁免（非并列元数据）；
 * - 中点 `·` 仅用于并列同类短元数据（统计项、进程单元格 `PID x · 项目名`），键值对一律标签式；
 * - 格式规则只约束 UI 自产文案；数据原值（命令行/路径/容器映射串）不作字符替换。
 */

/** 分隔符常量（§8.1/§8.2） */
export const SEP = {
  DOT: '·',
  ARROW: '→',
  ELLIPSIS: '…'
} as const

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
  stats: {
    labels: {
      total: '端口',
      tcp: 'TCP',
      udp: 'UDP',
      exposed: '对外'
    },
    template: '端口 {total} · TCP {tcp} · UDP {udp} · 对外 {exposed}'
  },
  tabs: {
    current: '当前',
    history: '历史'
  },
  table: {
    pidLabel: 'PID',
    emptyValue: '—',
    headers: {
      port: '端口',
      process: '进程',
      app: '应用',
      address: '地址',
      uptime: '运行时长',
      action: '操作'
    },
    historyHeaders: {
      port: '端口',
      process: '进程',
      interval: '时间区间',
      duration: '时长'
    }
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
    sections: {
      appProject: '应用与项目',
      network: '网络',
      process: '进程',
      time: '时间',
      runtime: '运行时'
    },
    fields: {
      application: '应用',
      project: '项目',
      port: '端口',
      address: '地址',
      protocol: '协议',
      state: '状态',
      exposure: '暴露',
      pid: 'PID',
      ppid: 'PPID',
      user: '用户',
      executable: '可执行文件',
      command: '命令',
      workingDir: '工作目录',
      processStart: '启动时刻',
      uptime: '运行时长',
      firstSeen: '首次出现',
      lastSeen: '最近出现',
      portDuration: '端口存续',
      cpu: 'CPU',
      memory: '内存'
    },
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
  },
  settings: {
    scanIntervalLabel: '扫描周期',
    interval1s: '1 秒',
    interval2s: '2 秒',
    interval5s: '5 秒',
    hint: '调整后立即生效，无需重启应用'
  }
} as const

/** 列定义（当前表/历史表：中文 label + key + 可选固定宽度） */
export interface ColumnDef {
  key: string
  label: string
  /** 固定宽度列（table-layout: fixed 下交给 colgroup；弹性列不设宽度） */
  width?: number
  /** 最小宽度意图（§5.4 进程列 min 220px 弹性；antd 无 minWidth，fixed 布局下由弹性分配保证） */
  minWidth?: number
}

/**
 * 列定义（§5.4：端口 140｜进程 min 220 弹性｜应用 140｜地址 弹性｜运行时长 96｜操作 88；
 * PROJECT 列并入进程列次要文本，D-UI-04）。
 * 端口列 120→140 为视觉走查 P2 微调：保证 5 位数端口 + 协议 + 对外标识单行不截断（2560 档不受影响）。
 * 历史表：端口｜进程（含 project 次要文本）｜时间区间｜时长（无对外标签，120 足够，保持 §5.4 原档）。
 */
export const COLUMN_DEFS: { current: ColumnDef[]; history: ColumnDef[] } = {
  current: [
    { key: 'port', label: COPY.table.headers.port, width: 140 },
    { key: 'process', label: COPY.table.headers.process, minWidth: 220 },
    { key: 'app', label: COPY.table.headers.app, width: 140 },
    { key: 'address', label: COPY.table.headers.address },
    { key: 'uptime', label: COPY.table.headers.uptime, width: 96 },
    { key: 'action', label: COPY.table.headers.action, width: 88 }
  ],
  history: [
    { key: 'port', label: COPY.table.historyHeaders.port, width: 120 },
    { key: 'process', label: COPY.table.historyHeaders.process, minWidth: 220 },
    { key: 'interval', label: COPY.table.historyHeaders.interval, width: 150 },
    { key: 'duration', label: COPY.table.historyHeaders.duration, width: 96 }
  ]
}

/**
 * 表格密度常量（§5.4 行密度定档的源码可测载体）：
 * 行高 = cellPaddingBlock × 2 + lineHeight + rowBorderWidth = 13×2 + 20 + 1 = 47px ∈ 44–60（目标 48 ✓）。
 * App.vue 表格单元格样式的 padding/line-height 与此恒等（app-shell 断言交叉核验）。
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
