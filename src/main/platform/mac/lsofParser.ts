/**
 * 监听端口机器格式解析器（方案 §5.3：纯函数、fixture 驱动、位置/前缀锚定）。
 * 输入：`lsof -nP -iTCP -sTCP:LISTEN -iUDP -F0pcnPT` 的 stdout（NUL 分隔 token）。
 * 规则（方案 §5.3）：
 * - `p` 开新进程组、`c` 更新命令名、`P` 给出该 socket 协议（PTCP/PUDP）、
 *   `n` 给出 地址:端口、`T` 为连接信息串（仅取 ST= 子字段作 state，忽略 QR/QS/未知）；
 * - `f` 与未知前缀忽略；缺 `P` 的 socket 丢弃并计入告警（防协议误判）；
 * - TCP 行 state≠LISTEN 丢弃（命令已过滤，防御性）；UDP 无 T，state=null；
 * - 地址 `*` 视为 wildcard；UDP `*:*`（无端口）丢弃；
 * - 按 (pid, protocol, addr, port) 去重（协议取自 P 字段）。
 * 同时提供批量工作目录输出解析（`-a -d cwd -Fn -p` 机器格式）。
 */
import type { RawPort } from '../types'

export interface LsofParseResult {
  ports: RawPort[]
  warnings: string[]
}

interface SocketDraft {
  pid: number
  command: string
  protocol: 'TCP' | 'UDP' | null
  localAddress: string
  localPort: number
  state: 'LISTEN' | null
}

const KNOWN_PROTOCOLS: ReadonlySet<string> = new Set(['TCP', 'UDP'])

/** 解析 `n` token 为地址/端口；IPv6 去方括号；无端口（如 `*:*`）返回 null */
function parseAddressPort(token: string): { address: string; port: number } | null {
  const raw = token.slice(1)
  const sep = raw.lastIndexOf(':')
  if (sep <= 0) {
    return null
  }
  const port = Number.parseInt(raw.slice(sep + 1), 10)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return null
  }
  const address = raw.slice(0, sep).replace(/^\[/, '').replace(/\]$/, '')
  return { address, port }
}

/**
 * 解析 T token：去掉 `T` 前缀后按空格/逗号/+ 切子字段，仅取 `ST=`（方案：忽略 QR/QS/未知）。
 * 形态兼容独立 token（`TST=LISTEN`）与串内多子字段（`TST=LISTEN QR=0 QS=0`）。
 */
function extractState(token: string): 'LISTEN' | string | null {
  const body = token.slice(1)
  for (const field of body.split(/[\s,+/]+/)) {
    if (field.startsWith('ST=')) {
      return field.slice(3)
    }
  }
  return null
}

export function parseLsofMachineOutput(output: string): LsofParseResult {
  const warnings: string[] = []
  const drafts: SocketDraft[] = []
  let currentPid = 0
  let currentCommand = ''
  let currentProtocol: 'TCP' | 'UDP' | null = null
  let lastDraft: SocketDraft | null = null

  // 真实输出以 NUL 分隔；fixture 以行+NUL 混排（两者都视为分隔符）
  const tokens = output.split(/\0|\r?\n/)
  for (const token of tokens) {
    if (token.length === 0) {
      continue
    }
    const prefix = token[0]
    const body = token.slice(1)
    switch (prefix) {
      case 'p': {
        currentPid = Number.parseInt(body, 10)
        if (!Number.isInteger(currentPid)) {
          currentPid = 0
        }
        currentCommand = ''
        currentProtocol = null
        lastDraft = null
        break
      }
      case 'c': {
        currentCommand = body
        break
      }
      case 'P': {
        if (KNOWN_PROTOCOLS.has(body)) {
          currentProtocol = body as 'TCP' | 'UDP'
        }
        break
      }
      case 'n': {
        const parsed = parseAddressPort(token)
        if (!parsed || currentPid === 0) {
          break
        }
        if (currentProtocol === null) {
          warnings.push(`socket dropped without protocol field: pid=${currentPid} ${body}`)
          lastDraft = null
          break
        }
        lastDraft = {
          pid: currentPid,
          command: currentCommand,
          protocol: currentProtocol,
          localAddress: parsed.address,
          localPort: parsed.port,
          state: null
        }
        drafts.push(lastDraft)
        break
      }
      case 'T': {
        // T 子字段归属最近一条 socket；state 仅在此处落位
        if (lastDraft !== null) {
          const state = extractState(token)
          if (state !== null) {
            lastDraft.state = state as 'LISTEN'
          }
        }
        break
      }
      default:
        // `f`（文件描述符）及 g/u/L/t/a 等未请求前缀一律忽略（方案 §2.3-1）
        break
    }
  }

  const deduped = new Map<string, RawPort>()
  for (const draft of drafts) {
    // UDP 无 T → state=null；TCP state≠LISTEN 丢弃（防御，扫描命令已过滤）
    if (draft.protocol === null || (draft.protocol === 'TCP' && draft.state !== 'LISTEN')) {
      continue
    }
    const protocol = draft.protocol
    const key = `${draft.pid}|${protocol}|${draft.localAddress}|${draft.localPort}`
    if (deduped.has(key)) {
      continue
    }
    deduped.set(key, {
      pid: draft.pid,
      command: draft.command,
      protocol,
      localAddress: draft.localAddress,
      localPort: draft.localPort,
      remoteAddress: null,
      remotePort: null,
      state: protocol === 'TCP' ? 'LISTEN' : null
    })
  }

  return { ports: [...deduped.values()], warnings }
}

/** 解析批量工作目录输出：`p<pid>` 开组，组内首个 `n<path>` 为该进程 cwd（路径含空格整段保留） */
export function parseCwdOutput(output: string): Map<number, string> {
  const result = new Map<number, string>()
  let currentPid = 0
  const tokens = output.split(/\0|\r?\n/)
  for (const token of tokens) {
    if (token.length === 0) {
      continue
    }
    const prefix = token[0]
    const body = token.slice(1)
    if (prefix === 'p') {
      currentPid = Number.parseInt(body, 10)
      if (!Number.isInteger(currentPid)) {
        currentPid = 0
      }
    } else if (prefix === 'n' && currentPid !== 0 && !result.has(currentPid)) {
      result.set(currentPid, body)
    }
  }
  return result
}
