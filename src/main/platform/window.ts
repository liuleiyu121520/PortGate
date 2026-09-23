/**
 * 窗口外观选项（UI 重构方案 §7.1，hiddenInset 与交通灯定位）：
 * 本文件是 process.platform 的唯一合法判定区（arch-boundary 断言/ESLint 双护栏）。
 * - darwin 且 TITLEBAR_MODE='inset' → hiddenInset + trafficLightPosition { x:16, y:20 }；
 *   y=20 依据：页眉高 52px、灯组高 12px，垂直居中 (52−12)/2=20；x=16 与页眉 80px 内容避让配对。
 * - 其余组合 → 空选项（系统标题栏；页眉不重复绘标题，§7.3 renderer 显隐规则配套）。
 */
import { TITLEBAR_MODE } from '../../shared/constants'

export interface WindowChromeOptions {
  titleBarStyle?: 'hiddenInset'
  trafficLightPosition?: { x: number; y: number }
}

/**
 * 取 BrowserWindow 外观选项。参数留默认即生产行为；
 * 显式传参仅供单元测试穷举 TITLEBAR_MODE × platform 四组合（window-options 断言）。
 */
export function getWindowOptions(
  mode: 'inset' | 'system' = TITLEBAR_MODE,
  platform: NodeJS.Platform = process.platform
): WindowChromeOptions {
  if (mode === 'inset' && platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 20 } }
  }
  return {}
}
