/**
 * 文案常量表契约断言（UI 重构方案 §8.4，D-UI-06 / UI-AC-22）：
 * - COPY 键位完整性：表头/按钮/状态/空态/tooltip/统计模板/设置项/抽屉分区逐键等于规定值；
 * - COLUMN_DEFS 列结构与 §5.4 定档恒等（六列中文表头、无 PROJECT 列、固定宽度档）；
 * - 分隔符常量与 fill() 模板填充；
 * - 时长紧凑格式（§8.3 全分支细案见 format-duration.test.ts，此处负向抽查）；
 * - src/renderer 下全部 .vue 的模板块旧形态扫描零命中（->、...、m0s、全大写表头词、
 *   英文主题名、全角括号 Tab 计数）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLUMN_DEFS, COPY, SEP, TABLE_DENSITY, fill } from '../../src/renderer/copy'
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

describe('COPY 键位完整性（§8.4-1 抽样全查）', () => {
  it('表头六项与历史表头（中文、无 PROJECT）', () => {
    expect(COPY.table.headers).toEqual({
      port: '端口',
      process: '进程',
      app: '应用',
      address: '地址',
      uptime: '运行时长',
      action: '操作'
    })
    expect(COPY.table.historyHeaders).toEqual({
      port: '端口',
      process: '进程',
      interval: '时间区间',
      duration: '时长'
    })
    expect(JSON.stringify(COPY)).not.toContain('PROJECT')
  })

  it('页眉/统计/Tab/搜索/按钮/空态/tooltip/设置逐键存在且等于规定值', () => {
    expect(COPY.header.title).toBe('PortGate · 端口门禁')
    expect(COPY.header.monitoring).toBe('监控中')
    expect(COPY.header.scanFailed).toBe('扫描失败')
    expect(COPY.header.themeLight).toBe('浅色')
    expect(COPY.header.themeDark).toBe('深色')
    expect(COPY.stats.labels).toEqual({ total: '端口', tcp: 'TCP', udp: 'UDP', exposed: '对外' })
    expect(COPY.stats.template).toBe('端口 {total} · TCP {tcp} · UDP {udp} · 对外 {exposed}')
    expect(COPY.tabs.current).toBe('当前')
    expect(COPY.tabs.history).toBe('历史')
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
    expect(COPY.settings.scanIntervalLabel).toBe('扫描周期')
    expect(COPY.settings.interval1s).toBe('1 秒')
    expect(COPY.settings.interval2s).toBe('2 秒')
    expect(COPY.settings.interval5s).toBe('5 秒')
  })

  it('抽屉五区（首区「应用与项目」）与字段标签中文化', () => {
    const sectionKeys = Object.keys(COPY.drawer.sections)
    expect(sectionKeys[0]).toBe('appProject')
    expect(Object.values(COPY.drawer.sections)).toEqual([
      '应用与项目',
      '网络',
      '进程',
      '时间',
      '运行时'
    ])
    expect(COPY.drawer.fields.application).toBe('应用')
    expect(COPY.drawer.fields.project).toBe('项目')
    expect(COPY.drawer.fields.workingDir).toBe('工作目录')
    expect(COPY.drawer.fields.portDuration).toBe('端口存续')
    expect(COPY.drawer.exposureLocal).toBe('Local · 仅本机')
    expect(COPY.drawer.exposureExposed).toBe('Exposed · 对外监听')
  })
})

describe('COLUMN_DEFS 列结构（§5.4 定档）', () => {
  it('当前表六列：中文 label、固定宽度 140/140/96/88、进程与地址弹性', () => {
    expect(COLUMN_DEFS.current.map((def) => def.label)).toEqual([
      '端口',
      '进程',
      '应用',
      '地址',
      '运行时长',
      '操作'
    ])
    // P2 视觉走查微调：端口列 120→140，容纳 5 位数端口 + 协议 + 对外标识单行
    expect(COLUMN_DEFS.current.find((def) => def.key === 'port')?.width).toBe(140)
    expect(COLUMN_DEFS.current.find((def) => def.key === 'app')?.width).toBe(140)
    expect(COLUMN_DEFS.current.find((def) => def.key === 'uptime')?.width).toBe(96)
    expect(COLUMN_DEFS.current.find((def) => def.key === 'action')?.width).toBe(88)
    expect(COLUMN_DEFS.current.find((def) => def.key === 'process')?.minWidth).toBe(220)
    expect(COLUMN_DEFS.current.find((def) => def.key === 'address')?.width).toBeUndefined()
    expect(COLUMN_DEFS.current.some((def) => def.key === 'project')).toBe(false)
  })

  it('历史表四列（PROJECT 并入进程列）', () => {
    expect(COLUMN_DEFS.history.map((def) => def.key)).toEqual(['port', 'process', 'interval', 'duration'])
  })
})

describe('分隔符与模板填充', () => {
  it('SEP 常量（§8.1）', () => {
    expect(SEP.DOT).toBe('·')
    expect(SEP.ARROW).toBe('→')
    expect(SEP.ELLIPSIS).toBe('…')
  })

  it('fill() 占位符替换（未知占位符原样保留）', () => {
    expect(fill(COPY.stats.template, { total: 46, tcp: 38, udp: 8, exposed: 5 })).toBe(
      '端口 46 · TCP 38 · UDP 8 · 对外 5'
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
  it('行高 = padding×2 + line-height + border = 47px ∈ 44–60', () => {
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

describe('模板块旧形态扫描（§8.4-2，UI-AC-22）', () => {
  const vueFiles = walkVue(RENDERER_ROOT)

  it('renderer 存在 .vue 文件（扫描范围非空）', () => {
    expect(vueFiles.length).toBeGreaterThan(0)
  })

  it('零命中：->、...、m0s、全大写表头词、英文主题名、全角括号计数', () => {
    const bannedLiterals = ['->', '...', 'Cloud Slate', 'Midnight Slate']
    const bannedPatterns: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\d+m0s/, label: '旧时长形态 m0s' },
      { pattern: /\b(PORT|PROCESS|APP|ADDRESS|UPTIME|ACTION|PROJECT)\b/, label: '全大写英文表头词' },
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
      expect(template.includes('COPY.'), `${name} 模板应引用 COPY 常量`).toBe(true)
    }
  })
})
