/**
 * 进程表解析器（方案 §5.3 / v1.1 M-02：纯函数、位置锚定、两条命令分别解析后按 pid join）。
 * - 核心表 `ps -axo pid=,ppid=,uid=,user=,lstart=,%cpu=,%mem=,comm=`：
 *   位置锚定 1=pid、2=ppid、3=uid、4=user、5..9=lstart（Www Mmm d hh:mm:ss yyyy，单数日期为
 *   空格填充但空白切分后仍为 5 token，固定月份映射转 epoch ms）、10=%cpu、11=%mem，
 *   其后剩余整段（保留内部空格、仅去尾部空白）= executablePath（列尾输出完整路径不截断）；
 * - 命令行表 `ps -axww -o pid=,args=`：token 1=pid、其余整段 = commandLine（-ww 防列宽截断）；
 * - join：executablePath 以核心表为准；命令行表缺失的 pid 其 commandLine 为空串。
 * 弃用「≥2 空格定长切分」——单空格列界（%mem 与 comm、comm 与 args 之间）实测存在（§2.3-10）。
 */
import type { RawProcess } from '../types'

/** 固定月份映射（locale 强制 C，消除本地化差异） */
const MONTH_INDEX: Readonly<Record<string, number>> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
}

/**
 * lstart 五段（Www Mmm d hh:mm:ss yyyy）→ 本地时区 epoch ms。
 * 单数日期为空格填充（POSIX %e），按空白切分后仍为 5 token（方案 §2.3-4/-10）。
 */
export function parseLstartToEpoch(lstart: readonly string[]): number {
  const [monthName, dayRaw, timeRaw, yearRaw] = [lstart[1], lstart[2], lstart[3], lstart[4]]
  const month = MONTH_INDEX[monthName] ?? -1
  const day = Number.parseInt(dayRaw, 10)
  const year = Number.parseInt(yearRaw, 10)
  const [hour, minute, second] = timeRaw.split(':').map((part) => Number.parseInt(part, 10))
  if (
    month < 0 ||
    !Number.isInteger(day) ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return 0
  }
  return new Date(year, month, day, hour, minute, second, 0).getTime()
}

export interface CoreTableResult {
  processes: RawProcess[]
  warnings: string[]
}

/** 解析进程核心表（不含 commandLine；join 时补齐） */
export function parseCoreTable(output: string): CoreTableResult {
  const processes: RawProcess[] = []
  const warnings: string[] = []
  for (const line of output.split(/\r?\n/)) {
    // ps 的 pid 列右对齐，行首/行尾均有填充空白：先 trim 再按空白切，
    // 否则首部会产生空 token 使位置锚定整体偏移
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }
    const tokens = trimmed.split(/\s+/)
    // 位置锚定：至少 11 个固定 token + 路径段（路径允许为空？comm 恒非空，<12 视为坏行）
    if (tokens.length < 12) {
      warnings.push(`core table line skipped (unexpected column count): ${trimmed}`)
      continue
    }
    const pid = Number.parseInt(tokens[0], 10)
    const ppid = Number.parseInt(tokens[1], 10)
    const uid = Number.parseInt(tokens[2], 10)
    const cpuPercent = Number.parseFloat(tokens[9])
    const memPercent = Number.parseFloat(tokens[10])
    if (
      !Number.isInteger(pid) ||
      !Number.isInteger(ppid) ||
      !Number.isInteger(uid) ||
      !Number.isFinite(cpuPercent) ||
      !Number.isFinite(memPercent)
    ) {
      warnings.push(`core table line skipped (numeric field invalid): ${trimmed}`)
      continue
    }
    // token 5..9 = lstart 五段；其后剩余整段（保留内部空格）= executablePath
    const executablePath = tokens.slice(11).join(' ')
    processes.push({
      pid,
      ppid,
      uid,
      user: tokens[3],
      startedAt: parseLstartToEpoch(tokens.slice(4, 9)),
      cpuPercent,
      memPercent,
      executablePath,
      commandLine: ''
    })
  }
  return { processes, warnings }
}

/** 解析命令行表：token 1 = pid，其余整段（保留空格）= commandLine */
export function parseArgsTable(output: string): Map<number, string> {
  const result = new Map<number, string>()
  for (const line of output.split(/\r?\n/)) {
    // 同核心表：先 trim 行首填充，再以首个空白为界切出 pid 与整段命令行
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }
    const sep = trimmed.search(/\s/)
    if (sep < 0) {
      continue
    }
    const pid = Number.parseInt(trimmed.slice(0, sep), 10)
    if (!Number.isInteger(pid)) {
      continue
    }
    result.set(pid, trimmed.slice(sep + 1))
  }
  return result
}

/** 按 pid join：核心表为基准（executablePath 以核心表为准），args 缺失的 pid commandLine 保持空串 */
export function joinProcessTables(core: RawProcess[], argsTable: Map<number, string>): RawProcess[] {
  return core.map((proc) => ({
    ...proc,
    commandLine: argsTable.get(proc.pid) ?? ''
  }))
}

/**
 * 沿 PPID 上溯收集进程祖先链（含自身）：深度上限 32，ppid≤1 止（方案 §5.6/§5.7）。
 * 环路与缺失父进程安全终止。
 */
export function collectProcessAncestry(
  table: ReadonlyMap<number, RawProcess>,
  pid: number,
  maxDepth = 32
): RawProcess[] {
  const chain: RawProcess[] = []
  const visited = new Set<number>()
  let current = table.get(pid)
  let depth = 0
  while (current !== undefined && depth < maxDepth && !visited.has(current.pid)) {
    visited.add(current.pid)
    chain.push(current)
    if (current.ppid <= 1) {
      break
    }
    current = table.get(current.ppid)
    depth += 1
  }
  return chain
}
