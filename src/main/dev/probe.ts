/**
 * 阶段 2 真机核对探针（dev-only，PORTGATE_SMOKE=1 门控；方案 §7 阶段 2 M-01 关闭判据）：
 * 「同一端口 TCP/UDP 协议徽标与 stats {total,tcp,udp,exposed} 分列与机器格式实际输出逐条一致」。
 * 流程：自起三个探针端口（127.0.0.1 TCP / 0.0.0.0 TCP / 0.0.0.0 UDP）→ 手动驱动三轮扫描 →
 * 独立执行一次机器格式扫描并与主进程快照逐条比对（跨验证：适配器全链路 vs 独立解析）→
 * 校验 PORT_OPENED / PORT_CLOSED 事件 → 输出 [PHASE2] 摘要。验证后关闭全部探针监听，不留长驻进程。
 */
import { spawn } from 'node:child_process'
import type { Socket } from 'node:dgram'
import { createSocket } from 'node:dgram'
import type { Server as TcpServer } from 'node:net'
import { createServer } from 'node:net'
import type { PortManager } from '../core/port/PortManager'
import { parseLsofMachineOutput } from '../platform/mac/lsofParser'
import type { RawPort } from '../platform/types'

const PROBE_TCP_LOOPBACK_PORT = 18180
const PROBE_UDP_PORT = 18181
const PROBE_TCP_WILDCARD_PORT = 18182

interface ProbePort {
  protocol: 'TCP' | 'UDP'
  localAddress: string
  localPort: number
}

const PROBE_PORTS: readonly ProbePort[] = [
  { protocol: 'TCP', localAddress: '127.0.0.1', localPort: PROBE_TCP_LOOPBACK_PORT },
  { protocol: 'UDP', localAddress: '*', localPort: PROBE_UDP_PORT },
  { protocol: 'TCP', localAddress: '*', localPort: PROBE_TCP_WILDCARD_PORT }
]

interface ProbeListeners {
  tcpLoopback: TcpServer
  tcpWildcard: TcpServer
  udp: Socket
}

function log(line: string): void {
  console.log(`[portgate] [PHASE2] ${line}`)
}

function matchKey(port: ProbePort | RawPort): string {
  return `${port.protocol}|${port.localAddress}|${port.localPort}`
}

/** 独立执行一次机器格式监听扫描（不复用适配器，作交叉验证基准） */
function probeScanPorts(): Promise<RawPort[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-iUDP', '-F0pcnPT'], {
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    })
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', (error: Error) => {
      reject(error)
    })
    child.on('close', (code: number | null) => {
      if (code === 0 || code === 1) {
        resolve(parseLsofMachineOutput(stdout).ports)
      } else {
        reject(new Error(`probe scan exited ${code}`))
      }
    })
  })
}

/** 自起探针监听（TCP loopback / TCP wildcard / UDP wildcard） */
async function startProbeListeners(): Promise<ProbeListeners> {
  const tcpLoopback = createServer()
  const tcpWildcard = createServer()
  const udp = createSocket('udp4')
  await new Promise<void>((resolve, reject) => {
    tcpLoopback.once('error', reject)
    tcpLoopback.listen(PROBE_TCP_LOOPBACK_PORT, '127.0.0.1', () => resolve())
  })
  await new Promise<void>((resolve, reject) => {
    tcpWildcard.once('error', reject)
    tcpWildcard.listen(PROBE_TCP_WILDCARD_PORT, '0.0.0.0', () => resolve())
  })
  await new Promise<void>((resolve, reject) => {
    udp.once('error', reject)
    udp.bind(PROBE_UDP_PORT, () => resolve())
  })
  return { tcpLoopback, tcpWildcard, udp }
}

function closeQuietly(target: TcpServer | Socket): void {
  try {
    target.close()
  } catch {
    // 已关闭的监听再次 close 会抛错，忽略
  }
}

export async function runPhase2Probe(manager: PortManager): Promise<void> {
  let listeners: ProbeListeners | null = null
  let failures = 0
  try {
    listeners = await startProbeListeners()

    // 第 1 轮：探针端口应产生 PORT_OPENED 并进入快照
    const cycle1 = await manager.scanCycle()
    const openedIds = cycle1.events
      .filter((event) => event.type === 'PORT_OPENED')
      .map((event) => event.recordId)
    for (const probe of PROBE_PORTS) {
      const prefix = `${probe.protocol}:${probe.localAddress}:${probe.localPort}:`
      const inSnapshot = cycle1.records.some((record) => matchKey(record) === matchKey(probe))
      const eventFired = openedIds.some((id) => id.startsWith(prefix))
      log(
        `PORT_OPENED ${probe.protocol} ${probe.localAddress}:${probe.localPort} ` +
          `inSnapshot=${inSnapshot} eventFired=${eventFired}`
      )
      if (!inSnapshot || !eventFired) {
        failures += 1
      }
    }

    // 第 2 轮（快照稳定后）：与独立机器格式扫描逐条比对 + stats 自洽
    await manager.scanCycle()
    const actual = await probeScanPorts()
    const actualKeys = new Set(actual.map((port) => matchKey(port)))
    const snapshot = manager.listSnapshot()
    let matched = 0
    for (const record of snapshot.records) {
      if (actualKeys.has(matchKey(record))) {
        matched += 1
      } else {
        log(`MISMATCH 仅主进程快照: ${matchKey(record)}`)
      }
    }
    log(
      `crossCheck snapshot=${snapshot.records.length} match=${matched}/${snapshot.records.length} ` +
        `independentScan=${actual.length}（两时间点间系统端口竞态变动不计失败，探针端口缺失除外）`
    )
    const records = snapshot.records
    const stats = snapshot.stats
    const statsOk =
      stats.total === records.length &&
      stats.tcp === records.filter((r) => r.protocol === 'TCP').length &&
      stats.udp === records.filter((r) => r.protocol === 'UDP').length &&
      stats.exposed ===
        records.filter((r) => r.localAddress !== '127.0.0.1' && r.localAddress !== '::1').length
    log(
      `stats total=${stats.total} tcp=${stats.tcp} udp=${stats.udp} exposed=${stats.exposed} ` +
        `selfConsistent=${statsOk}`
    )
    if (!statsOk) {
      failures += 1
    }
    for (const probe of PROBE_PORTS) {
      if (!actualKeys.has(matchKey(probe))) {
        log(`FAIL 探针端口在独立扫描中缺失: ${matchKey(probe)}`)
        failures += 1
      }
    }

    // 第 3 轮：关闭 loopback 探针端口 → 应产生 PORT_CLOSED 且快照不再包含
    const closing = listeners.tcpLoopback
    closing.close()
    const cycle3 = await manager.scanCycle()
    const closedIds = cycle3.events
      .filter((event) => event.type === 'PORT_CLOSED')
      .map((event) => event.recordId)
    const closedFired = closedIds.some((id) =>
      id.startsWith(`TCP:127.0.0.1:${PROBE_TCP_LOOPBACK_PORT}:`)
    )
    const stillThere = cycle3.records.some(
      (record) => record.protocol === 'TCP' && record.localPort === PROBE_TCP_LOOPBACK_PORT
    )
    log(
      `PORT_CLOSED TCP 127.0.0.1:${PROBE_TCP_LOOPBACK_PORT} ` +
        `eventFired=${closedFired} removedFromSnapshot=${!stillThere}`
    )
    if (!closedFired || stillThere) {
      failures += 1
    }
  } catch (error) {
    failures += 1
    log(`probe aborted with error: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    if (listeners !== null) {
      closeQuietly(listeners.tcpLoopback)
      closeQuietly(listeners.tcpWildcard)
      closeQuietly(listeners.udp)
    }
  }
  log(`SUMMARY: ${failures === 0 ? 'PASS' : `FAIL (${failures} failures)`}`)
}
