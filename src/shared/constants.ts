import type { ScanInterval, ThemeName } from './types'

/** 允许的扫描周期档位（需求 §19 / 方案 §4.2：仅接受 1000/2000/5000） */
export const SCAN_INTERVAL_OPTIONS: readonly ScanInterval[] = [1000, 2000, 5000]

/** 默认扫描周期（需求 §19：默认 2 秒） */
export const DEFAULT_SCAN_INTERVAL: ScanInterval = 2000

/** 允许的主题枚举（需求 §23） */
export const THEME_NAMES: readonly ThemeName[] = ['light', 'dark']

/**
 * 标题栏模式（UI 重构方案 §7.4，R-UI-2 回退开关，单点可独立 revert）：
 * - 'inset'（默认）：macOS 注入 hiddenInset + 交通灯定位，renderer 页眉为唯一标题层；
 * - 'system'：恢复系统标题栏（main 不注入 hiddenInset），renderer 全平台页眉去重复标题（仅状态与控件）。
 * 平台相关的「是否适用」判定全部在 src/main/platform/window.ts 内完成（arch-boundary 合法区）。
 */
export const TITLEBAR_MODE: 'inset' | 'system' = 'inset'

/* --------------- SecurityClassifier 路径前缀常量（方案 §5.10：收敛于此，§16 高风险路径） --------------- */

/** 高风险路径 → SYSTEM_CRITICAL（需求 §16：/System/、/usr/libexec/） */
export const SYSTEM_CRITICAL_PATH_PREFIXES: readonly string[] = ['/System/', '/usr/libexec/']

/** 系统路径 → SYSTEM */
export const SYSTEM_PATH_PREFIXES: readonly string[] = [
  '/usr/sbin/',
  '/usr/bin/',
  '/sbin/',
  '/private/var/db/'
]

/** 用户域路径（方案 §5.10 规则 6：在用户域且 uid === 当前 uid → USER） */
export const USER_DOMAIN_PREFIXES: readonly string[] = [
  '/Users/',
  '/Applications/',
  '/opt/homebrew/',
  '/usr/local/'
]

/**
 * CSP 定稿记录（方案 §3.3 / v1.2 m-06「二选一」的定稿与存档，位于 ipc-contract 同级常量文件）。
 *
 * 定稿路线：dev 与 prod 均注入 CSP meta（注入实现见 electron.vite.config.ts 的
 * portgate:csp-injection 插件，按 dev/prod 分别取下列常量）：
 * - dev：完整指令集 + `connect-src 'self' ws:`（放行 Vite HMR WebSocket）
 * - prod：完整指令集（无 connect-src 放宽）
 *
 * `style-src 'unsafe-inline'` 为必选项：ant-design-vue@4.x 运行时为 CSS-in-JS，
 * 注入内联 <style>，仅 default-src 'self' 会阻断样式渲染。
 */
export const CSP_PROD =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
export const CSP_DEV = `${CSP_PROD}; connect-src 'self' ws:`
