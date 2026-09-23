/**
 * App 壳层组件断言（UI 重构方案 §9 阶段 B，UI-AC-10/13/19 的组件度量口径）：
 * - 列头中文六项、无 PROJECT 列（D-UI-04）；
 * - 进程单元格：projectName 命中区间渲染 <mark>（经 HighlightText 唯一实现）、无 project 不渲染占位；
 * - 行高常量推算 44–60（TABLE_DENSITY）+ 单元格样式恒等交叉核验（copy-contract）；
 * - user-select 断言（分段控件/表头/页眉）、点击区 28px 常量、分段选中交互蓝；
 * - 统计条中文标签 + 琥珀唯一条件（仅 Exposed>0）。
 * 桥 mock：window.portgate 全方法白名单形状（不发真实 IPC）。
 */
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import Antd from 'ant-design-vue'
import App from '../../src/renderer/App.vue'
import { TABLE_DENSITY } from '../../src/renderer/copy'
import { usePortsStore } from '../../src/renderer/stores/ports'
import type { PortgateApi } from '../../src/shared/ipc-contract'
import type { HighlightRange, PortRecord, SearchMatchInfo } from '../../src/shared/types'

const PROJECT_ROOT = process.cwd()

interface Fixture {
  records: PortRecord[]
  matches: Record<string, SearchMatchInfo>
}

function makeRecord(overrides: Partial<PortRecord> & { recordId: string; localPort: number }): PortRecord {
  return {
    protocol: 'TCP',
    localAddress: '127.0.0.1',
    pid: 4321,
    process: { pid: 4321, name: 'node' },
    timing: { firstSeen: 1_000, lastSeen: 2_000 },
    security: { level: 'USER' },
    ...overrides
  }
}

function installBridge(fixture: Fixture): void {
  const bridge = {
    getSettings: () => Promise.resolve({ scanInterval: 2000, theme: 'light' }),
    setSettings: () => Promise.resolve({ ok: true }),
    getPortList: () =>
      Promise.resolve({
        records: fixture.records,
        stats: { total: fixture.records.length, tcp: fixture.records.length, udp: 0, exposed: 0 },
        matches: fixture.matches
      }),
    getPortDetail: () => Promise.resolve(null),
    refreshPorts: () => Promise.resolve({ ok: true }),
    onPortEvents: () => () => undefined,
    terminatePort: () => Promise.resolve({ recordId: '', status: 'DONE' as const }),
    forceTerminatePort: () => Promise.resolve({ recordId: '', status: 'DONE' as const }),
    revealRecord: () => Promise.resolve({ ok: true }),
    getPortHistory: () => Promise.resolve([])
  }
  window.portgate = bridge as unknown as PortgateApi
}

const RECORD_WITH_PROJECT = makeRecord({
  recordId: 'TCP:127.0.0.1:5173:4321',
  localPort: 5173,
  process: { pid: 4321, name: 'node server.js' },
  project: { name: 'vitest-project', path: '/tmp/vitest-project' }
})

const RECORD_WITHOUT_PROJECT = makeRecord({
  recordId: 'TCP:127.0.0.1:8080:4322',
  localPort: 8080,
  pid: 4322,
  process: { pid: 4322, name: 'python' }
})

async function mountApp(fixture: Fixture) {
  installBridge(fixture)
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(App, { global: { plugins: [pinia, Antd] } })
  const portsStore = usePortsStore(pinia)
  portsStore.records = fixture.records
  portsStore.stats = { total: fixture.records.length, tcp: fixture.records.length, udp: 0, exposed: 0 }
  portsStore.matches = fixture.matches
  portsStore.ready = true
  await nextTick()
  await nextTick()
  return { wrapper, portsStore }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('表格列结构（UI-AC-13 / D-UI-04；v1.2 双语表头）', () => {
  it('表头双语双行堆叠：EN 主行大写 + CN 辅助行，无 PROJECT 列', async () => {
    const { wrapper } = await mountApp({ records: [RECORD_WITH_PROJECT], matches: {} })
    const headerEn = wrapper.findAll('.pg-th__en').map((el) => el.text().trim())
    const headerCn = wrapper.findAll('.pg-th__cn').map((el) => el.text().trim())
    // 双表常驻（v-show）：当前表 6 对 + 历史表 4 对
    for (const en of ['PORT', 'PROCESS', 'APP', 'ADDRESS', 'UPTIME', 'ACTION', 'INTERVAL', 'DURATION']) {
      expect(headerEn).toContain(en)
    }
    for (const cn of ['端口', '进程', '应用', '地址', '运行时长', '操作', '时间区间', '时长']) {
      expect(headerCn).toContain(cn)
    }
    expect(headerEn).not.toContain('PROJECT')
    wrapper.unmount()
  })

  it('进程单元格：projectName 命中区间渲染 <mark>（HighlightText 联动）', async () => {
    const matches: Record<string, SearchMatchInfo> = {
      [RECORD_WITH_PROJECT.recordId]: {
        score: 1,
        highlights: {
          processName: [[0, 2]] as HighlightRange[],
          projectName: [[0, 2]] as HighlightRange[]
        }
      }
    }
    const { wrapper } = await mountApp({ records: [RECORD_WITH_PROJECT], matches })
    const processCell = wrapper.find('.pg-pid')
    expect(processCell.exists()).toBe(true)
    // projectName 命中（区间 [0,2) of 'vitest-project'）在该行内渲染 mark
    const marks = wrapper.findAll('mark').map((mark) => mark.text())
    expect(marks).toContain('vi')
    // PID 数字同样可命中高亮
    wrapper.unmount()
  })

  it('无 project 时进程单元格不渲染占位（—），单元格含 PID 次要文本', async () => {
    const { wrapper } = await mountApp({ records: [RECORD_WITHOUT_PROJECT], matches: {} })
    const processCell = wrapper.find('.pg-pid')
    expect(processCell.exists()).toBe(true)
    expect(processCell.text()).toContain('PID')
    expect(processCell.text()).not.toContain('—')
    wrapper.unmount()
  })
})

describe('行密度与单行化（UI-AC-10 组件度量口径）', () => {
  it('行高常量推算 44–60（13×2 + 20 + 1 = 47，目标 48）', () => {
    const rowHeight =
      TABLE_DENSITY.cellPaddingBlock * 2 + TABLE_DENSITY.lineHeight + TABLE_DENSITY.rowBorderWidth
    expect(rowHeight).toBeGreaterThanOrEqual(44)
    expect(rowHeight).toBeLessThanOrEqual(60)
  })

  it('单元格单行化样式存在（nowrap + ellipsis）且废除 word-break', () => {
    const source = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.vue'), 'utf-8')
    expect(source).toContain('white-space: nowrap')
    expect(source).toContain('text-overflow: ellipsis')
    expect(source).not.toContain('word-break')
  })

  it('可视行密度源码口径：单元格里无行内次要块级堆叠（history 进程列并入 project，非独立列）', () => {
    const source = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.vue'), 'utf-8')
    expect(source.includes("column.key === 'project'")).toBe(false)
  })
})

describe('分段控件与交互语法（UI-AC-19/17）', () => {
  it('分段控件渲染两段（当前/历史 + 计数）且选中段挂 accent（源码口径）', async () => {
    const { wrapper } = await mountApp({ records: [RECORD_WITH_PROJECT], matches: {} })
    const segments = wrapper.findAll('.pg-seg')
    expect(segments).toHaveLength(2)
    expect(segments[0].text()).toContain('当前')
    expect(segments[1].text()).toContain('历史')
    wrapper.unmount()

    const source = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.vue'), 'utf-8')
    expect(source).toMatch(/&--active\s*\{[^}]*var\(--pg-accent\)/)
  })

  it('user-select 断言：分段控件与表头（源码口径）', () => {
    const app = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.vue'), 'utf-8')
    expect(app).toMatch(/\.pg-segments\s*\{[^}]*user-select:\s*none/)
    expect(app).toMatch(/\.ant-table-thead[^{]*\{[^}]*user-select:\s*none/s)
    expect(app).toMatch(/\.pg-header\s*\{[^}]*user-select:\s*none/)
  })

  it('操作按钮三级语法：点击区 28px 常量 + 危险升格类（源码口径）', () => {
    const base = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/styles/base.less'), 'utf-8')
    expect(base).toContain('min-width: 28px')
    expect(base).toContain('min-height: 28px')
    expect(base).toContain('.pg-btn--terminate')
    expect(base).toContain('var(--pg-danger-text)')
    expect(base).not.toContain('danger-tint')
  })

  it('保护进程禁用态：tooltip 锚点 + 禁用按钮渲染、USER 行可点击', async () => {
    const protectedRecord = makeRecord({
      recordId: 'TCP:127.0.0.1:1:1',
      localPort: 88,
      pid: 1,
      process: { pid: 1, name: 'launchd' },
      security: { level: 'SYSTEM' }
    })
    const { wrapper } = await mountApp({ records: [protectedRecord, RECORD_WITH_PROJECT], matches: {} })
    const buttons = wrapper.findAll('.pg-btn--terminate')
    expect(buttons).toHaveLength(2)
    const disabledButtons = buttons.filter((btn) => btn.attributes('disabled') !== undefined)
    expect(disabledButtons).toHaveLength(1)
    // 禁用态外层透明壳（tooltip 锚点）
    expect(wrapper.find('.pg-btn-mask button').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('统计条（UI-AC-23；v1.2 双语标签）', () => {
  it('EN 主标签 + CN 辅助（TCP/UDP 豁免）；exposed=0 时对外项恒中性', async () => {
    const { wrapper, portsStore } = await mountApp({ records: [RECORD_WITH_PROJECT], matches: {} })
    const statsText = wrapper.find('.pg-stats').text()
    for (const label of ['Ports', '端口数', 'TCP', 'UDP', 'Exposed', '对外']) {
      expect(statsText).toContain(label)
    }
    expect(portsStore.stats.exposed).toBe(0)
    expect(wrapper.find('.pg-stats__item--exposed').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('hiddenInset 接线（§7 源码口径，行为四组合见 window-options.test.ts）', () => {
  it('App.vue 引用 TITLEBAR_MODE 决定页眉标题显隐', () => {
    const source = readFileSync(resolve(PROJECT_ROOT, 'src/renderer/App.vue'), 'utf-8')
    expect(source).toContain('TITLEBAR_MODE')
    expect(source).toContain('showHeaderTitle')
  })
})
