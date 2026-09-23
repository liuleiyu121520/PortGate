/**
 * 文案常量表契约断言（UI 重构方案 §8.5，D-UI-06 / UI-AC-22；v1.2 双语标注规则）：
 * - 双语对完整性（§8.5-1 + MINOR-UIR3-002）：六组逐对恒等断言——表头 6 / 历史表头 4 / 统计 4 /
 *   抽屉五区 5 / 抽屉字段 20（含首区 Application/Project）/ 设置 1 的 en/cn 精确匹配 §8.2 定名表；
 * - 豁免白名单恒等：cn === null 仅允许 TCP/UDP/CPU（扫描周期选项值「1 秒/2 秒/5 秒」为纯中文
 *   保留域，MINOR-UIR3-004 裁定，不在 cn:null 域）；
 * - EN 形态断言（§8.5-2）：表头与抽屉分区 en 全大写；dt 字段标签原样大小写；
 * - 分隔符常量与 fill() 模板填充；
 * - 时长紧凑格式（§8.3 全分支细案见 format-duration.test.ts，此处负向抽查）；
 * - src/renderer 下全部 .vue 的模板块旧形态扫描零命中（->、...、m0s、全大写表头词字面量、
 *   英文主题名、全角括号 Tab 计数；表头词仅可出自 copy.ts 经 {{ label.en }} 渲染）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COPY,
  DRAWER_FIELDS,
  DRAWER_SECTIONS,
  HISTORY_COLUMNS,
  SETTINGS,
  SEP,
  STATS_LABELS,
  TABLE_COLUMNS,
  TABLE_DENSITY,
  fill,
  type BilingualLabel
} from '../../src/renderer/copy'
import { formatDuration } from '../../src/renderer/utils/format'

const RENDERER_ROOT = resolve(process.cwd(), 'src/renderer')

function walkVue(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walkVue(full))
    } else if (full.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

/** 模板块截取（首个 <template> 至最后一个 </template>，容纳嵌套 template 插槽） */
function templateOf(source: string): string {
  const start = source.indexOf('<template>')
  const end = source.lastIndexOf('</template>')
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

/** 逐对恒等断言（en/cn 精确匹配 §8.2 定名表） */
function expectPairs(
  groupName: string,
  actual: Record<string, BilingualLabel> | readonly BilingualLabel[],
  expected: Record<string, [string, string | null]>
): void {
  const entries: Array<[string, BilingualLabel]> = Array.isArray(actual)
    ? actual.map((label) => [label.en, label])
    : Object.entries(actual)
  expect(`${groupName}:${entries.length}`, `${groupName} 对数`).toBe(
    `${groupName}:${Object.keys(expected).length}`
  )
  for (const [key, [en, cn]] of Object.entries(expected)) {
    const label = (entries.find(([entryKey]) => entryKey === key) ?? entries.find(([, label]) => label.en === en))?.[1]
    expect(label, `${groupName}.${key} 存在`).toBeDefined()
    expect(label?.en, `${groupName}.${key}.en`).toBe(en)
    expect(label?.cn, `${groupName}.${key}.cn`).toBe(cn)
  }
}

describe('COPY 纯中文保留域键位完整性（§8.1 保留域）', () => {
  it('页眉/搜索/按钮/空态/tooltip/消息逐键存在且等于规定值', () => {
    expect(COPY.header.title).toBe('PortGate · 端口门禁')
    expect(COPY.header.monitoring).toBe('监控中')
    expect(COPY.header.scanFailed).toBe('扫描失败')
    expect(COPY.header.themeLight).toBe('浅色')
    expect(COPY.header.themeDark).toBe('深色')
    expect(COPY.search.placeholder).toBe('搜索端口、PID、进程、应用、项目、路径、命令…')
    expect(COPY.search.kbd).toBe('⌘K')
    expect(COPY.actions).toEqual({
      terminate: '结束',
      terminateProcess: '结束进程',
      forceTerminate: '强制结束',
      cancel: '取消',
      copyCommand: '复制命令',
      openProjectDir: '打开项目目录'
    })
    expect(COPY.empty.current).toBe('暂无监听端口')
    expect(COPY.empty.search).toBe('没有匹配的结果')
    expect(COPY.empty.searchHint).toBe('试试其他关键词或清空搜索')
    expect(COPY.empty.history).toBe('暂无历史会话')
    expect(COPY.tooltips.protected).toBe('系统进程，受保护（{level}），禁止结束')
    expect(COPY.messages.terminateTitle).toBe('结束进程')
    expect(COPY.messages.forceTitle).toBe('进程未响应 SIGTERM')
    expect(COPY.messages.forceContent).toBe('{process} 未响应正常终止，是否强制结束（SIGKILL）？')
  })

  it('抽屉保留域（标题/暴露值层/hint）与技术记号', () => {
    expect(COPY.drawer.title).toBe('端口详情')
    expect(COPY.drawer.exposureLocal).toBe('Local · 仅本机')
    expect(COPY.drawer.exposureExposed).toBe('Exposed · 对外监听')
    expect(COPY.table.pidLabel).toBe('PID')
    expect(COPY.table.emptyValue).toBe('—')
  })
})

describe('双语定名表六组逐对恒等（§8.2 + §8.5-1 + MINOR-UIR3-002）', () => {
  it('第 1 组·当前表表头 6 对', () => {
    expectPairs(
      'TABLE_COLUMNS',
      TABLE_COLUMNS.map((def) => def.label),
      {
        PORT: ['PORT', '端口'],
        PROCESS: ['PROCESS', '进程'],
        APP: ['APP', '应用'],
        ADDRESS: ['ADDRESS', '地址'],
        UPTIME: ['UPTIME', '运行时长'],
        ACTION: ['ACTION', '操作']
      }
    )
  })

  it('第 2 组·历史表头 4 对', () => {
    expectPairs(
      'HISTORY_COLUMNS',
      HISTORY_COLUMNS.map((def) => def.label),
      {
        PORT: ['PORT', '端口'],
        PROCESS: ['PROCESS', '进程'],
        INTERVAL: ['INTERVAL', '时间区间'],
        DURATION: ['DURATION', '时长']
      }
    )
  })

  it('第 3 组·统计 4 对（2 豁免）', () => {
    expectPairs('STATS_LABELS', STATS_LABELS, {
      total: ['Ports', '端口数'],
      tcp: ['TCP', null],
      udp: ['UDP', null],
      exposed: ['Exposed', '对外']
    })
  })

  it('第 4 组·抽屉五区 5 对（首区 APPLICATION / PROJECT 应用与项目）', () => {
    expectPairs('DRAWER_SECTIONS', DRAWER_SECTIONS, {
      appProject: ['APPLICATION / PROJECT', '应用与项目'],
      network: ['NETWORK', '网络'],
      process: ['PROCESS', '进程'],
      time: ['TIME', '时间'],
      runtime: ['RUNTIME', '运行时']
    })
  })

  it('第 5 组·抽屉字段 20 对（1 豁免；含首区 Application/Project，MINOR-UIR3-002）', () => {
    expectPairs('DRAWER_FIELDS', DRAWER_FIELDS, {
      application: ['Application', '应用'],
      project: ['Project', '项目'],
      port: ['Port', '端口'],
      address: ['Address', '地址'],
      protocol: ['Protocol', '协议'],
      state: ['State', '状态'],
      exposure: ['Exposure', '暴露'],
      pid: ['PID', '进程 ID'],
      ppid: ['PPID', '父进程'],
      user: ['User', '用户'],
      executable: ['Executable', '可执行文件'],
      command: ['Command', '命令'],
      workingDir: ['Working Dir', '工作目录'],
      processStart: ['Process Start', '进程启动时间'],
      uptime: ['Uptime', '已运行'],
      portDuration: ['Port Duration', '占用时长'],
      firstSeen: ['First Seen', '首次发现'],
      lastSeen: ['Last Seen', '最近发现'],
      cpu: ['CPU', null],
      memory: ['Memory', '内存']
    })
  })

  it('第 6 组·设置（Scan Interval 扫描周期；选项值维持「1 秒/2 秒/5 秒」，MINOR-UIR3-004）', () => {
    expect(SETTINGS.scanIntervalLabel.en).toBe('Scan Interval')
    expect(SETTINGS.scanIntervalLabel.cn).toBe('扫描周期')
    expect(SETTINGS.intervalOptions.map((option) => option.value)).toEqual([1000, 2000, 5000])
    expect(SETTINGS.intervalOptions.map((option) => option.label)).toEqual(['1 秒', '2 秒', '5 秒'])
  })

  it('豁免白名单恒等：cn === null 仅 TCP/UDP/CPU（§8.5-1）', () => {
    const allLabels: BilingualLabel[] = [
      ...TABLE_COLUMNS.map((def) => def.label),
      ...HISTORY_COLUMNS.map((def) => def.label),
      ...Object.values(STATS_LABELS),
      ...Object.values(DRAWER_SECTIONS),
      ...Object.values(DRAWER_FIELDS),
      SETTINGS.scanIntervalLabel
    ]
    const exempted = allLabels.filter((label) => label.cn === null).map((label) => label.en)
    expect([...exempted].sort()).toEqual(['CPU', 'TCP', 'UDP'])
  })

  it('EN 形态断言（§8.5-2）：表头/分区全大写；dt 字段原样大小写', () => {
    for (const def of [...TABLE_COLUMNS, ...HISTORY_COLUMNS]) {
      expect(def.label.en, `${def.key} en 大写`).toBe(def.label.en.toUpperCase())
    }
    for (const [key, section] of Object.entries(DRAWER_SECTIONS)) {
      expect(section.en, `section ${key} en 大写`).toBe(section.en.toUpperCase())
    }
    // dt 字段保持原样大小写（Port 非 PORT；技术缩写 PID/PPID/CPU 原样）
    expect(DRAWER_FIELDS.port.en).toBe('Port')
    expect(DRAWER_FIELDS.processStart.en).toBe('Process Start')
    expect(DRAWER_FIELDS.pid.en).toBe('PID')
    expect(Object.keys(DRAWER_FIELDS)).toHaveLength(20)
  })
})

describe('列结构（§5.4 定档；端口 140 为锁定实现 MINOR-UIR3-003）', () => {
  it('当前表六列：双语 label、固定宽度 140/140/96/88、进程与地址弹性、无 project 列', () => {
    expect(TABLE_COLUMNS.map((def) => def.key)).toEqual([
      'port',
      'process',
      'app',
      'address',
      'uptime',
      'action'
    ])
    expect(TABLE_COLUMNS.find((def) => def.key === 'port')?.width).toBe(140)
    expect(TABLE_COLUMNS.find((def) => def.key === 'app')?.width).toBe(140)
    expect(TABLE_COLUMNS.find((def) => def.key === 'uptime')?.width).toBe(96)
    expect(TABLE_COLUMNS.find((def) => def.key === 'action')?.width).toBe(88)
    expect(TABLE_COLUMNS.find((def) => def.key === 'process')?.minWidth).toBe(220)
    expect(TABLE_COLUMNS.find((def) => def.key === 'address')?.width).toBeUndefined()
    expect(TABLE_COLUMNS.some((def) => def.key === 'project')).toBe(false)
  })

  it('历史表四列（PROJECT 并入进程列）', () => {
    expect(HISTORY_COLUMNS.map((def) => def.key)).toEqual(['port', 'process', 'interval', 'duration'])
  })
})

describe('分隔符与模板填充', () => {
  it('SEP 常量（§8.1）', () => {
    expect(SEP.DOT).toBe('·')
    expect(SEP.ARROW).toBe('→')
    expect(SEP.ELLIPSIS).toBe('…')
  })

  it('fill() 占位符替换（未知占位符原样保留）', () => {
    expect(fill(COPY.messages.terminateContent, { process: 'node', protocol: 'TCP', port: 5173, pid: 22415 })).toBe(
      'node · TCP 5173（PID 22415），确认结束该进程？'
    )
    expect(fill(COPY.tooltips.protected, { level: 'SYSTEM' })).toBe('系统进程，受保护（SYSTEM），禁止结束')
    expect(fill('{a} {missing}', { a: 1 })).toBe('1 {missing}')
  })
})

describe('时长紧凑格式（§8.3/§8.4-3；全分支细案见 format-duration.test.ts）', () => {
  it('秒位为零省略的负向抽查', () => {
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(150_000)).toBe('2m30s')
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(4_980_000)).toBe('1h23m')
    expect(formatDuration(120_000)).toBe('2m')
  })
})

describe('表格密度常量（§5.4 行高推算载体）', () => {
  it('行高 = padding×2 + line-height + border = 47px ∈ 44–60（表头带 48px 不在该断言域）', () => {
    const rowHeight =
      TABLE_DENSITY.cellPaddingBlock * 2 + TABLE_DENSITY.lineHeight + TABLE_DENSITY.rowBorderWidth
    expect(rowHeight).toBe(47)
    expect(rowHeight).toBeGreaterThanOrEqual(44)
    expect(rowHeight).toBeLessThanOrEqual(60)
  })

  it('App.vue 单元格样式与常量恒等（padding 13px 12px / line-height 20px）', () => {
    const source = readFileSync(join(RENDERER_ROOT, 'App.vue'), 'utf-8')
    expect(source).toContain(`padding: ${TABLE_DENSITY.cellPaddingBlock}px ${TABLE_DENSITY.cellPaddingInline}px`)
    expect(source).toContain(`line-height: ${TABLE_DENSITY.lineHeight}px`)
  })
})

describe('模板块旧形态扫描（§8.5-3，UI-AC-22）', () => {
  const vueFiles = walkVue(RENDERER_ROOT)

  it('renderer 存在 .vue 文件（扫描范围非空）', () => {
    expect(vueFiles.length).toBeGreaterThan(0)
  })

  it('零命中：->、...、m0s、大写表头词字面量、英文主题名、全角括号计数', () => {
    const bannedLiterals = ['->', '...', 'Cloud Slate', 'Midnight Slate']
    const bannedPatterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\d+m0s/, label: '旧时长形态 m0s' },
      { pattern: /\b(PORT|PROCESS|APP|ADDRESS|UPTIME|ACTION|PROJECT|INTERVAL|DURATION|NETWORK|RUNTIME)\b/, label: '大写表头/分区词字面量' },
      { pattern: /（\d+）/, label: '全角括号 Tab 计数' }
    ]
    for (const file of vueFiles) {
      const template = templateOf(readFileSync(file, 'utf-8'))
      for (const literal of bannedLiterals) {
        expect(template.includes(literal), `${file} 模板残留「${literal}」`).toBe(false)
      }
      for (const { pattern, label } of bannedPatterns) {
        expect(pattern.test(template), `${file} 模板命中${label}`).toBe(false)
      }
    }
  })

  it('组件模板引用 COPY 常量（禁止散落字面量的正向抽查）', () => {
    for (const name of ['App.vue', 'components/SearchBar.vue', 'components/DetailDrawer.vue']) {
      const template = templateOf(readFileSync(join(RENDERER_ROOT, name), 'utf-8'))
      expect(
        template.includes('COPY.') || template.includes('F.') || template.includes('S.'),
        `${name} 模板应引用 copy.ts 常量`
      ).toBe(true)
    }
  })
})
