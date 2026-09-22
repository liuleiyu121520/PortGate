/**
 * 展示格式化工具（需求 §5/§6）：
 * - 时长：Uptime / Port Duration（当前时间 - Process Start / First Seen，每分钟重算展示）；
 * - 时刻：Process Start / First Seen / Last Seen（Last Seen ≠ Last Active，§6）。
 */

/** 时长：>1h → `1h23m`；>1m → `5m12s`；其余 → `45s` */
export function formatDuration(ms: number): string {
  const safe = Math.max(ms, 0)
  const totalSeconds = Math.floor(safe / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}h${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`
  }
  return `${seconds}s`
}

/** 本地时刻 HH:mm:ss（24 小时制） */
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}
