/**
 * 设计 token 契约断言（UI 重构方案 §4.6/§4.7，UI-AC-01/02/04/05/07/09 的自动化载体）：
 * - token 三处同源：variables.less / themes.less / theme.ts 对全部语义 token 解析值恒等；
 * - WCAG 相对亮度对比度全集（文本 ≥4.5 / 禁用与非文本 ≥3 / hairline ≥1.2 自设可辨下限）；
 * - 旧色值/旧色板对象源码扫描零命中；字重梯 {300,400,600,700}；box-shadow 唯一功能阴影规则；
 * - 字体栈 system-ui/-apple-system；圆角五档字面量集合；字距仅 0/负值；uppercase 禁令；
 * - .pg-num 存在且被数字单元格引用（tabular-nums）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FONT_STACK, PG_RADIUS, THEME_TOKENS } from '../../src/renderer/theme'
import type { ThemeTokens } from '../../src/renderer/theme'

const PROJECT_ROOT = process.cwd()
const SRC_ROOT = join(PROJECT_ROOT, 'src')
const SOURCE_EXTS = new Set(['.ts', '.vue', '.less'])

function walkSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walkSources(full))
    } else if (SOURCE_EXTS.has(full.slice(full.lastIndexOf('.')))) {
      out.push(full)
    }
  }
  return out
}

const allSources = walkSources(SRC_ROOT)

function read(relative: string): string {
  return readFileSync(resolve(SRC_ROOT, relative), 'utf-8')
}

/** 颜色/值比较口径：去空白 + 小写 */
function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

/* ------------------------------ 三处同源解析 ------------------------------ */

/** 解析 variables.less 的 Less 变量表（`@name: value;`） */
function parseLessVariables(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of source.matchAll(/@([\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim())
  }
  return map
}

/** 解析 themes.less 的 :root 与 [data-theme='dark'] 两作用域（@ref 经变量表解析） */
function parseThemeScopes(source: string, vars: Map<string, string>): Map<string, Map<string, string>> {
  const scopes = new Map<string, Map<string, string>>()
  for (const block of source.matchAll(/(:root|\[data-theme='dark'\])\s*\{([^}]*)\}/g)) {
    const scope = new Map<string, string>()
    for (const match of block[2].matchAll(/(--pg-[\w-]+)\s*:\s*([^;]+);/g)) {
      const raw = match[2].trim()
      scope.set(match[1], raw.startsWith('@') ? (vars.get(raw.slice(1)) ?? raw) : raw)
    }
    scopes.set(block[1], scope)
  }
  return scopes
}

const lessVars = parseLessVariables(read('renderer/styles/variables.less'))
const scopes = parseThemeScopes(read('renderer/styles/themes.less'), lessVars)
const lightScope = scopes.get(':root')
const darkScope = scopes.get("[data-theme='dark']")

/** CSS custom property ↔ ThemeTokens 键位映射（含 bg/elevated 两别名行，v1.1 m-02） */
const TOKEN_KEY_TO_VAR: Record<keyof ThemeTokens, string> = {
  bg: '--pg-bg',
  canvas: '--pg-canvas',
  surface: '--pg-surface',
  text: '--pg-text',
  muted: '--pg-muted',
  hairline: '--pg-hairline',
  accent: '--pg-accent',
  accentFill: '--pg-accent-fill',
  accentHover: '--pg-accent-hover',
  accentFillHover: '--pg-accent-fill-hover',
  focus: '--pg-focus',
  dangerText: '--pg-danger-text',
  dangerFill: '--pg-danger-fill',
  warning: '--pg-warning',
  success: '--pg-success',
  disabled: '--pg-disabled',
  elevated: '--pg-elevated',
  highlightBg: '--pg-highlight-bg',
  scrim: '--pg-scrim',
  shadowOverlay: '--pg-shadow-overlay'
}

/* ------------------------------ 对比度计算（WCAG 相对亮度） ------------------------------ */

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

function parseColor(input: string): Rgba {
  const value = input.trim().toLowerCase()
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1
    }
  }
  const match = value.match(/rgba?\(([^)]+)\)/)
  if (match === null) {
    throw new Error(`无法解析颜色：${input}`)
  }
  const parts = match[1].split(',').map((part) => Number(part.trim()))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
}

/** rgba 先按 alpha 与指定实色表面混合成实色再计算（§4.6 rgba token 口径） */
function blendOver(fg: Rgba, bg: Rgba): Rgba {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  }
}

function relativeLuminance(color: Rgba): number {
  const channel = (raw: number): number => {
    const s = raw / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/** 前景色对实色表面的对比度（rgba 自动混合） */
function contrastOnSurface(fg: string, surface: string): number {
  return contrastRatio(blendOver(parseColor(fg), parseColor(surface)), parseColor(surface))
}

/* ------------------------------ 断言 ------------------------------ */

describe('token 三处同源（§4.1：variables.less / themes.less / theme.ts 恒等）', () => {
  it('themes.less 两作用域均存在', () => {
    expect(lightScope).toBeDefined()
    expect(darkScope).toBeDefined()
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`theme.ts 与 themes.less ${theme} 作用域对全部语义 token 恒等`, () => {
      const scope = theme === 'light' ? lightScope : darkScope
      expect(scope).toBeDefined()
      for (const [key, cssVar] of Object.entries(TOKEN_KEY_TO_VAR)) {
        const expected = normalize(THEME_TOKENS[theme][key as keyof ThemeTokens])
        const actual = normalize(scope?.get(cssVar) ?? 'MISSING')
        expect(actual, `${cssVar} (${theme})`).toBe(expected)
      }
    })
  }

  it('圆角五档与间距档在 :root 落为规定值', () => {
    expect(lightScope?.get('--pg-radius-xs')).toBe('5px')
    expect(lightScope?.get('--pg-radius-sm')).toBe('8px')
    expect(lightScope?.get('--pg-radius-md')).toBe('11px')
    expect(lightScope?.get('--pg-radius-lg')).toBe('18px')
    expect(lightScope?.get('--pg-radius-pill')).toBe('9999px')
    expect(lightScope?.get('--pg-space-3')).toBe('12px')
    expect(lightScope?.get('--pg-space-4')).toBe('16px')
  })

  it('on-primary token 在 :root 落为 #ffffff（colors.on-primary，红主钮文字档）', () => {
    expect(lightScope?.get('--pg-on-primary')).toBe('#ffffff')
  })

  it('明暗主题派生值符合方案 §4.1 定档（暗面填充档 #0071e3 / 危险红 #d70015+#ff6961）', () => {
    expect(THEME_TOKENS.light.accentFill).toBe(THEME_TOKENS.light.accent)
    expect(normalize(THEME_TOKENS.dark.accent)).toBe('#2997ff')
    expect(normalize(THEME_TOKENS.dark.accentFill)).toBe('#0071e3')
    expect(normalize(THEME_TOKENS.dark.dangerText)).toBe('#ff6961')
    expect(normalize(THEME_TOKENS.dark.dangerFill)).toBe(normalize(THEME_TOKENS.light.dangerFill))
    expect(normalize(THEME_TOKENS.light.bg)).toBe(normalize(THEME_TOKENS.light.canvas))
    expect(normalize(THEME_TOKENS.light.elevated)).toBe(normalize(THEME_TOKENS.light.canvas))
  })
})

describe('对比度断言全集（§4.6，UI-AC-09）', () => {
  const light = THEME_TOKENS.light
  const dark = THEME_TOKENS.dark

  it('明色文本档 × 所属表面全集 ≥4.5', () => {
    for (const fg of [light.text, light.muted, light.accent, light.dangerText, light.warning]) {
      for (const surface of [light.canvas, light.surface]) {
        expect(contrastOnSurface(fg, surface)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('暗色文本档 × 所属表面全集 ≥4.5', () => {
    for (const fg of [dark.text, dark.muted, dark.accent, dark.dangerText, dark.warning]) {
      for (const surface of [dark.canvas, dark.surface]) {
        expect(contrastOnSurface(fg, surface)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('白字 × 按钮填充档（accent-fill/danger-fill 双主题）≥4.5', () => {
    for (const tokens of [light, dark]) {
      expect(contrastOnSurface('#ffffff', tokens.accentFill)).toBeGreaterThanOrEqual(4.5)
      expect(contrastOnSurface('#ffffff', tokens.dangerFill)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('红主钮文字契约（视觉走查 P1 防回退）：on-primary(#ffffff) × danger-fill ≥4.5 且 hover/active 同底不变', () => {
    // 确认弹窗与 PENDING_FORCE 强制弹窗的红色主按钮：白字压 --pg-danger-fill，
    // hover/active 由 base.less 钉死同色填充（白字 × #D70015 = 5.38:1）
    for (const tokens of [light, dark]) {
      const ratio = contrastOnSurface('#ffffff', tokens.dangerFill)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
      expect(ratio).toBeCloseTo(5.38, 1)
    }
    // base.less 三处（常态/hover+active）均引用 --pg-on-primary，防红字回退
    const base = read('renderer/styles/base.less')
    const confirmBlock = base.slice(base.indexOf('.pg-confirm .ant-modal-confirm-btns .ant-btn-dangerous'))
    expect(confirmBlock.match(/color:\s*var\(--pg-on-primary\)/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('危险 hover 升格素面四对（danger-text × 表面全集双主题）≥4.5（§4.1 派生裁定 7）', () => {
    expect(contrastOnSurface(light.dangerText, light.canvas)).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(light.dangerText, light.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(dark.dangerText, dark.canvas)).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(dark.dangerText, dark.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('禁用文字 ≥3（保护原因文案走 muted ≥4.5 已含于文本档全集）', () => {
    expect(contrastOnSurface(light.disabled, light.canvas)).toBeGreaterThanOrEqual(3)
    expect(contrastOnSurface(dark.disabled, dark.canvas)).toBeGreaterThanOrEqual(3)
  })

  it('非文本 ≥3：success 状态点 / warning / 焦点环 × 全表面（双主题）', () => {
    for (const tokens of [light, dark]) {
      for (const surface of [tokens.canvas, tokens.surface]) {
        expect(contrastOnSurface(tokens.success, surface)).toBeGreaterThanOrEqual(3)
        expect(contrastOnSurface(tokens.warning, surface)).toBeGreaterThanOrEqual(3)
        expect(contrastOnSurface(tokens.focus, surface)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('hairline ≥1.2（自设可辨下限；暗色 rgba 先混合再计算）', () => {
    for (const surface of [light.canvas, light.surface]) {
      expect(contrastOnSurface(light.hairline, surface)).toBeGreaterThanOrEqual(1.2)
    }
    for (const surface of [dark.bg, dark.canvas, dark.surface]) {
      expect(contrastOnSurface(dark.hairline, surface)).toBeGreaterThanOrEqual(1.2)
    }
  })
})

describe('旧值/旧形态源码扫描（§4.7，UI-AC-01/02）', () => {
  it('16 个旧色值在 src/ 全树零命中（大小写不敏感）', () => {
    const legacyColors = [
      '#F6F7F9', '#E7E9ED', '#1D2129', '#667085', '#98A2B3', '#4F6EF7',
      '#22A06B', '#F59E0B', '#E5484D', '#17191D', '#1E2126', '#24282E',
      '#30343B', '#A7ADB7', '#6D85FF', '#F2F4F7'
    ]
    for (const file of allSources) {
      const source = readFileSync(file, 'utf-8').toLowerCase()
      for (const color of legacyColors) {
        expect(source.includes(color.toLowerCase()), `${file} 残留旧色 ${color}`).toBe(false)
      }
    }
  })

  it('旧色板对象 THEME_PALETTES 零残留（双维护镜像废除）', () => {
    for (const file of allSources) {
      expect(readFileSync(file, 'utf-8').includes('THEME_PALETTES'), `${file} 残留 THEME_PALETTES`).toBe(false)
    }
  })
})

describe('排版契约（§4.5/§4.7，UI-AC-05/06）', () => {
  it('字体栈含 system-ui 与 -apple-system（CSS 与 JS 镜像两处）', () => {
    const base = read('renderer/styles/base.less')
    expect(base.includes('system-ui')).toBe(true)
    expect(base.includes('-apple-system')).toBe(true)
    expect(FONT_STACK.includes('system-ui')).toBe(true)
    expect(FONT_STACK.includes('-apple-system')).toBe(true)
  })

  it('font-weight 全 src ∈ {300,400,600,700}（禁 500）', () => {
    const allowed = new Set(['300', '400', '600', '700'])
    for (const file of allSources) {
      for (const match of readFileSync(file, 'utf-8').matchAll(/font-weight\s*:\s*(\d{3})/g)) {
        expect(allowed.has(match[1]), `${file} 非法字重 ${match[1]}`).toBe(true)
      }
    }
  })

  it('.pg-num 工具类存在（tabular-nums）且 App/抽屉引用（UI-AC-06）', () => {
    const base = read('renderer/styles/base.less')
    expect(base).toMatch(/\.pg-num\s*\{[^}]*font-variant-numeric:\s*tabular-nums/)
    expect(read('renderer/App.vue')).toContain('pg-num')
    expect(read('renderer/components/DetailDrawer.vue')).toContain('pg-num')
  })

  it('letter-spacing 仅允许 0/normal/负值；uppercase 禁令零命中', () => {
    for (const file of allSources) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(/letter-spacing\s*:\s*([^;]+);/g)) {
        const value = match[1].trim()
        const ok = value === '0' || value === 'normal' || value.startsWith('-')
        expect(ok, `${file} 非法字距 ${value}`).toBe(true)
      }
      expect(/text-transform\s*:\s*uppercase/.test(source), `${file} 出现 uppercase`).toBe(false)
    }
  })

  it('页面标题档 17px/600 含 -0.2px 负字距（§4.5 Display 语法定档）', () => {
    const app = read('renderer/App.vue')
    expect(app).toContain('font-size: 17px')
    expect(app).toContain('letter-spacing: -0.2px')
  })
})

describe('形状与阴影契约（§4.3/§4.7，UI-AC-04/07）', () => {
  it('PG_RADIUS 五档 ∈ 断言集合 {5,8,11,18,9999}', () => {
    expect([5, 8, 11, 18, 9999]).toEqual(expect.arrayContaining(Object.values(PG_RADIUS)))
    expect(Object.values(PG_RADIUS).every((value) => [5, 8, 11, 18, 9999].includes(value))).toBe(true)
  })

  it('border-radius 字面量全部落在五档集合或 var(--pg-radius-*) 引用（50% 禁止）', () => {
    const allowed = new Set([0, 5, 8, 11, 18, 9999])
    for (const file of allSources) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(/border-radius\s*:\s*([^;]+);/g)) {
        // 剥离 !important 后缀（antd cssinjs 后注入的覆盖层需要）
        const declaration = match[1].replace(/!important/g, '').trim()
        expect(declaration.includes('%'), `${file} 禁止百分比圆角：${declaration}`).toBe(false)
        for (const token of declaration.split(/\s+/)) {
          if (token === '' || token.startsWith('var(--pg-radius-')) {
            continue
          }
          const numeric = Number.parseFloat(token)
          expect(
            allowed.has(numeric),
            `${file} 档外圆角 ${token}（允许集合 {0,5,8,11,18,9999} 或 --pg-radius-*）`
          ).toBe(true)
        }
      }
    }
  })

  it('box-shadow 字面量仅允许 variables.less（token 定义）；其余仅 none 中和或 var(--pg-shadow-overlay)', () => {
    for (const file of allSources) {
      const relative = file.slice(SRC_ROOT.length + 1).replaceAll('\\', '/')
      const isTokenSource = relative === 'renderer/styles/variables.less'
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(/box-shadow\s*:\s*([^;]+);/g)) {
        const value = match[1].replace(/!important/g, '').trim()
        if (isTokenSource) {
          continue
        }
        const ok = value === 'none' || value === 'var(--pg-shadow-overlay)'
        expect(ok, `${file} 非法 box-shadow：${match[1].trim()}`).toBe(true)
      }
    }
  })
})
