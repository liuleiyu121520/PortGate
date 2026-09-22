/**
 * 主题色板 JS 源（需求 §23），供 antd ConfigProvider token 使用。
 * Less 侧镜像见 src/renderer/styles/variables.less（CSS custom properties 来源），
 * 两处同步维护；下方注释标注需求 §23 未定义槽位的取值口径。
 */
import type { ThemeName } from '../shared/types'

export interface ThemePalette {
  background: string
  surface: string
  surface2: string
  border: string
  text: string
  secondary: string
  muted: string
  accent: string
  success: string
  warning: string
  danger: string
}

export const THEME_PALETTES: Record<ThemeName, ThemePalette> = {
  light: {
    // Cloud Slate（需求 §23 Light Theme 原值）
    background: '#F6F7F9',
    surface: '#FFFFFF',
    surface2: '#FFFFFF',
    border: '#E7E9ED',
    text: '#1D2129',
    secondary: '#667085',
    muted: '#98A2B3',
    accent: '#4F6EF7',
    success: '#22A06B',
    warning: '#F59E0B',
    danger: '#E5484D'
  },
  dark: {
    // Midnight Slate（需求 §23 Dark Theme 原值，仅 7 色）
    background: '#17191D',
    surface: '#1E2126',
    surface2: '#24282E',
    border: '#30343B',
    text: '#F2F4F7',
    secondary: '#A7ADB7',
    // 需求 §23 暗色未定义 Muted 与功能色：Muted 取 Secondary 同值，
    // Success/Warning/Danger 沿用亮色值（不新造色相）
    muted: '#A7ADB7',
    accent: '#6D85FF',
    success: '#22A06B',
    warning: '#F59E0B',
    danger: '#E5484D'
  }
}

/** 把主题落到 <html data-theme>（CSS custom properties 作用域切换，见 styles/themes.less） */
export function applyThemeToDocument(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}
