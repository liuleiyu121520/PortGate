/**
 * 设计 token 的 JS 镜像（UI 重构方案 §4.1/§4.8），供 antd ConfigProvider 使用。
 * Less 源变量见 styles/variables.less、CSS custom properties 见 styles/themes.less；
 * 三处同源由 tests/unit/design-tokens.test.ts 解析断言恒等。applyThemeToDocument 原样保留。
 */
import type { ThemeName } from '../shared/types'

/** 单主题语义 token 集（与 themes.less 的 --pg-* 作用域一一对应） */
export interface ThemeTokens {
  bg: string
  canvas: string
  surface: string
  text: string
  muted: string
  hairline: string
  accent: string
  accentFill: string
  accentHover: string
  accentFillHover: string
  focus: string
  dangerText: string
  dangerFill: string
  warning: string
  success: string
  disabled: string
  elevated: string
  highlightBg: string
  scrim: string
  shadowOverlay: string
}

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  light: {
    bg: '#ffffff',
    canvas: '#ffffff',
    surface: '#f5f5f7',
    text: '#1d1d1f',
    muted: '#6e6e73',
    hairline: '#e0e0e0',
    accent: '#0066cc',
    accentFill: '#0066cc',
    accentHover: '#0059b3',
    accentFillHover: '#0059b3',
    focus: '#0071e3',
    dangerText: '#d70015',
    dangerFill: '#d70015',
    warning: '#b45309',
    success: '#1e8e5a',
    disabled: '#7a7a7a',
    elevated: '#ffffff',
    highlightBg: 'rgba(0, 102, 204, 0.16)',
    scrim: 'rgba(0, 0, 0, 0.32)',
    shadowOverlay: '0 12px 40px rgba(0, 0, 0, 0.16)'
  },
  dark: {
    bg: '#252527',
    canvas: '#272729',
    surface: '#2a2a2c',
    text: '#ffffff',
    muted: '#cccccc',
    hairline: 'rgba(255, 255, 255, 0.14)',
    accent: '#2997ff',
    accentFill: '#0071e3',
    accentHover: '#55aaff',
    accentFillHover: '#0069c9',
    focus: '#409cff',
    dangerText: '#ff6961',
    dangerFill: '#d70015',
    warning: '#ff9f0a',
    success: '#30d158',
    disabled: '#808082',
    elevated: '#2a2a2c',
    highlightBg: 'rgba(41, 151, 255, 0.22)',
    scrim: 'rgba(0, 0, 0, 0.5)',
    shadowOverlay: '0 12px 40px rgba(0, 0, 0, 0.5)'
  }
}

/** 圆角五档（§4.3，UI-AC-04 断言集合 {0, 5, 8, 11, 18, 9999}；供 antd token 消费） */
export const PG_RADIUS = {
  xs: 5,
  sm: 8,
  md: 11,
  lg: 18,
  pill: 9999
} as const

/** §4.5 字体栈（UI-AC-05：system-ui 领衔 + PingFang SC 中文回退） */
export const FONT_STACK =
  "system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif"

/** 把主题落到 <html data-theme>（CSS custom properties 作用域切换，见 styles/themes.less） */
export function applyThemeToDocument(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}
