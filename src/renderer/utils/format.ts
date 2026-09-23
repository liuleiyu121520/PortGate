/**
 * 展示格式化工具（需求 §5/§6；时长紧凑规则见 UI 重构方案 §8.3）：
 * - 时长：Uptime / Port Duration / 历史会话时长（每分钟重算展示）；
 *   秒位为零则省略：45s、60s→1m、150s→2m30s、3600s→1h、4980s→1h23m（1m0s/1h0m 形态消失）；
 * - 时刻：Process Start / First Seen / Last Seen（Last Seen ≠ Last Active，§6）。
 */

/** 时长：>1h → `1h23m`（零分钟省略为 `1h`）；>1m → `5m12s`（零秒省略为 `5m`）；其余 → `45s` */
export function formatDuration(ms: number): string {
  const safe = Math.max(ms, 0)
  const totalSeconds = Math.floor(safe / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`
  }
  return `${seconds}s`
}

/** 本地时刻 HH:mm:ss（24 小时制） */
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}
