/**
 * 阶段 2 真机核对探针（dev-only，PORTGATE_SMOKE=1 门控；方案 §7 阶段 2 M-01 关闭判据）：
 * 「同一端口 TCP/UDP 协议徽标与 stats {total,tcp,udp,exposed} 分列与机器格式实际输出逐条一致」。
 * 流程：自起三个探针端口（127.0.0.1 TCP / 0.0.0.0 TCP / 0.0.0.0 UDP）→ 手动驱动三轮扫描 →
 * 独立执行一次机器格式扫描并与主进程快照逐条比对（跨验证：适配器全链路 vs 独立解析）→
 * 校验 PORT_OPENED / PORT_CLOSED 事件 → 输出 [PHASE2] 摘要。验证后关闭全部探针监听，不留长驻进程。
 */
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { Socket } from 'node:dgram'
import { createSocket } from 'node:dgram'
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { Server as TcpServer } from 'node:net'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PortManager } from '../core/port/PortManager'
import type { KillPolicy } from '../core/security/KillPolicy'
import type { SessionStore } from '../core/store/SessionStore'
import type { SettingsStore } from '../core/store/SettingsStore'
import type { PortRecord } from '../../shared/types'
import { computeExposure } from '../core/port/exposure'
import { parseLsofMachineOutput } from '../platform/mac/lsofParser'
import { parseLstartToEpoch } from '../platform/mac/psParser'
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

/* ------------------------------ 阶段 3 真机核对（M-04 第一段） ------------------------------ */

const PHASE3_HTTP_PORT = 18190
const PHASE3_NC_PORT = 18191
const PHASE3_WORKDIR = '/tmp/portgate-phase3-probe'

function sleepProbe(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 独立执行 ps，返回目标 pid 的原始行（trim 后）；未找到返回 null */
function probePsRow(psArgs: string[], pid: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('ps', psArgs, { env: { ...process.env, LC_ALL: 'C', LANG: 'C' } })
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', (error: Error) => reject(error))
    child.on('close', () => {
      const line = stdout
        .split(/\r?\n/)
        .find((row) => row.trim().startsWith(`${pid} `))
      resolve(line === undefined ? null : line.trim())
    })
  })
}

/** 独立执行批量工作目录探测，返回目标 pid 的 cwd 原始值 */
function probeCwd(pid: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', String(pid)], {
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    })
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', (error: Error) => reject(error))
    child.on('close', () => {
      const token = stdout.split(/\0|\r?\n/).find((item) => item.startsWith('n'))
      resolve(token === undefined ? null : token.slice(1))
    })
  })
}

/** 轮询扫描直至目标端口记录进入快照（SMOKE 模式下扫描由探针手动驱动） */
async function waitForPortRecord(
  manager: PortManager,
  protocol: 'TCP' | 'UDP',
  port: number,
  attempts = 6
): Promise<PortRecord> {
  let found: PortRecord | undefined
  for (let attempt = 0; attempt < attempts && found === undefined; attempt++) {
    const { records } = await manager.scanCycle()
    found = records.find((record) => record.protocol === protocol && record.localPort === port)
    if (found === undefined) {
      await sleepProbe(500)
    }
  }
  if (found === undefined) {
    throw new Error(`record ${protocol}:${port} not found after ${attempts} scan cycles`)
  }
  return found
}

/**
 * 阶段 3 真机核对（方案 §7 阶段 3 / M-04 第一段）：
 * 八项（Port/PID/Process/Command/Working Directory/Start Time/Uptime/Exposure）与
 * 机器格式实际输出一致；带空格路径应用的 Command/Executable 与 ps 输出一致（M-02 真机判据）；
 * App/Project 仅验字段位保留（阶段 4 Resolver 接入，R-03）。验证后清理全部探针进程与目录。
 *
 * 带空格路径可执行用 cc（Xcode CLT）现场编译最小监听器：系统二进制（如 /usr/bin/nc）是
 * platform binary，复制到非系统路径会被内核静默 SIGKILL，无法作探针。
 */
const PHASE3_LISTENER_C = `#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
int main(int argc, char **argv) {
  int port = argc > 1 ? atoi(argv[1]) : 18191;
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons((unsigned short)port);
  if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) return 1;
  if (listen(fd, 4) != 0) return 1;
  for (;;) {
    int client = accept(fd, 0, 0);
    if (client >= 0) { close(client); }
  }
}
`

function log3(line: string): void {
  console.log(`[portgate] [PHASE3] ${line}`)
}

export async function runPhase3Probe(manager: PortManager): Promise<void> {
  const children: ChildProcess[] = []
  let failures = 0
  const spaceDir = join(PHASE3_WORKDIR, 'probe dir with space')
  const listenerSourcePath = join(PHASE3_WORKDIR, 'probe-listener.c')
  const listenerBinaryPath = join(spaceDir, 'pg probe srv')
  try {
    mkdirSync(spaceDir, { recursive: true })
    writeFileSync(listenerSourcePath, PHASE3_LISTENER_C)
    // cc（Xcode CLT）编译产物自动 adhoc 签名，路径无关可执行
    const compile = spawnSync('cc', ['-O2', '-o', listenerBinaryPath, listenerSourcePath])
    if (compile.status !== 0) {
      throw new Error(`probe listener compile failed: ${String(compile.stderr)}`)
    }

    const httpChild = spawn(
      probeWhichNode(),
      ['-e', `require('http').createServer((q,s)=>s.end('ok')).listen(${PHASE3_HTTP_PORT}, '127.0.0.1')`],
      { cwd: PHASE3_WORKDIR, stdio: 'ignore' }
    )
    children.push(httpChild)
    const srvChild = spawn(listenerBinaryPath, [String(PHASE3_NC_PORT)], { stdio: 'ignore' })
    children.push(srvChild)
    const httpPid = httpChild.pid
    const srvPid = srvChild.pid
    if (httpPid === undefined || srvPid === undefined) {
      throw new Error('probe child process failed to start')
    }
    await sleepProbe(400)

    const httpRecord = await waitForPortRecord(manager, 'TCP', PHASE3_HTTP_PORT)
    const pidText = String(httpPid)
    // /tmp 在 macOS 是 /private/tmp 的符号链接：期望值取真实路径（与探测输出同口径）
    const expectedWorkdir = realpathSync(PHASE3_WORKDIR)

    // 1. Port
    const portOk = httpRecord.localPort === PHASE3_HTTP_PORT
    log3(`M04-1 Port record=${httpRecord.localPort} expected=${PHASE3_HTTP_PORT} ok=${portOk}`)
    if (!portOk) failures += 1

    // 2. PID
    const pidOk = httpRecord.pid === httpPid
    log3(`M04-2 PID record=${httpRecord.pid} expected=${String(httpPid)} ok=${pidOk}`)
    if (!pidOk) failures += 1

    // 3. Process（ps comm 列尾 basename）
    const nameOk = httpRecord.process.name === 'node'
    log3(`M04-3 Process record=${httpRecord.process.name} expected=node ok=${nameOk}`)
    if (!nameOk) failures += 1

    // 4. Command：与独立 ps args 输出一致（-ww 完整命令行）
    const argsLine = await probePsRow(['-axww', '-o', 'pid=,args='], httpPid)
    const expectedCommand = argsLine === null ? null : argsLine.slice(pidText.length).trim()
    const commandOk =
      expectedCommand !== null && httpRecord.process.commandLine === expectedCommand
    log3(
      `M04-4 Command ok=${commandOk} record=${JSON.stringify(httpRecord.process.commandLine)} ` +
        `independent=${JSON.stringify(expectedCommand)}`
    )
    if (!commandOk) failures += 1

    // 5. Working Directory：record === 探针真实路径 === 独立工作目录探测输出（三方一致）
    const independentCwd = await probeCwd(httpPid)
    const cwdOk =
      httpRecord.process.workingDirectory === expectedWorkdir && independentCwd === expectedWorkdir
    log3(
      `M04-5 WorkingDirectory record=${JSON.stringify(httpRecord.process.workingDirectory)} ` +
        `independent=${JSON.stringify(independentCwd)} ok=${cwdOk}`
    )
    if (!cwdOk) failures += 1

    // 6. Start Time：与独立 ps 核心表 lstart 解析的 epoch 毫秒级一致
    const coreLine = await probePsRow(
      ['-axo', 'pid=,ppid=,uid=,user=,lstart=,%cpu=,%mem=,comm='],
      httpPid
    )
    const coreTokens = coreLine === null ? [] : coreLine.split(/\s+/)
    const expectedStartedAt = coreTokens.length >= 9 ? parseLstartToEpoch(coreTokens.slice(4, 9)) : -1
    const startedAtOk =
      coreTokens.length >= 9 && httpRecord.process.startedAt === expectedStartedAt
    log3(
      `M04-6 StartTime record=${String(httpRecord.process.startedAt)} ` +
        `independent=${String(expectedStartedAt)} ok=${startedAtOk}`
    )
    if (!startedAtOk) failures += 1

    // 7. Uptime：First Seen 晚于进程启动（时钟容差 1.5s）且早于当前时刻
    const startedAt = httpRecord.process.startedAt ?? 0
    const uptimeOk =
      httpRecord.timing.firstSeen >= startedAt - 1500 && httpRecord.timing.firstSeen <= Date.now()
    log3(`M04-7 Uptime firstSeen=${httpRecord.timing.firstSeen} startedAt=${startedAt} ok=${uptimeOk}`)
    if (!uptimeOk) failures += 1

    // 8. Exposure：127.0.0.1 → Local（仅本机）
    const exposureOk =
      httpRecord.localAddress === '127.0.0.1' &&
      computeExposure(httpRecord.localAddress) === 'local'
    log3(
      `M04-8 Exposure record=${httpRecord.localAddress} -> ${computeExposure(httpRecord.localAddress)} ok=${exposureOk}`
    )
    if (!exposureOk) failures += 1

    // 带空格路径应用（M-02 真机判据）：Command 与 Executable 与 ps 输出一致
    const srvRecord = await waitForPortRecord(manager, 'TCP', PHASE3_NC_PORT)
    const srvArgsLine = await probePsRow(['-axww', '-o', 'pid=,args='], srvPid)
    const expectedSrvCommand =
      srvArgsLine === null ? null : srvArgsLine.slice(String(srvPid).length).trim()
    const spacePathOk =
      srvRecord.process.executablePath === listenerBinaryPath &&
      srvRecord.process.commandLine === expectedSrvCommand &&
      srvRecord.process.name === 'pg probe srv' &&
      expectedSrvCommand === `${listenerBinaryPath} ${PHASE3_NC_PORT}`
    log3(
      `M02 space-path Executable ok=${srvRecord.process.executablePath === listenerBinaryPath} ` +
        `Command ok=${srvRecord.process.commandLine === expectedSrvCommand} ` +
        `(${JSON.stringify(srvRecord.process.commandLine)})`
    )
    if (!spacePathOk) failures += 1

    // Exposed 口径复核（wildcard 绑定）
    const srvExposureOk =
      srvRecord.localAddress === '*' && computeExposure(srvRecord.localAddress) === 'exposed'
    log3(
      `M04-8b Exposure wildcard record=${srvRecord.localAddress} -> ${computeExposure(srvRecord.localAddress)} ok=${srvExposureOk}`
    )
    if (!srvExposureOk) failures += 1

    // 字段位保留（R-03）：阶段 4 起 Resolver 真实识别（本探针进程宿主为 Electron.app），
    // 断言升级为「识别对象形态合法或为空」
    const slotsOk =
      (httpRecord.application === undefined ||
        (httpRecord.application.name.length > 0 && (httpRecord.application.path ?? '').length > 0)) &&
      (httpRecord.project === undefined || (httpRecord.project.name ?? '').length > 0) &&
      httpRecord.container === undefined
    log3(
      `M04 slots application=${JSON.stringify(httpRecord.application?.name)} ` +
        `project=${JSON.stringify(httpRecord.project?.name)} reserved-with-valid-shape ok=${slotsOk}`
    )
    if (!slotsOk) failures += 1
  } catch (error) {
    failures += 1
    log3(`phase3 probe aborted with error: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    for (const child of children) {
      try {
        if (child.pid !== undefined) {
          process.kill(child.pid, 'SIGKILL')
        }
      } catch {
        // 进程已退出则忽略
      }
    }
    rmSync(PHASE3_WORKDIR, { recursive: true, force: true })
  }
  log3(`SUMMARY: ${failures === 0 ? 'PASS' : `FAIL (${failures} failures)`}`)
}

/* --------------------- 阶段 4 真机核对（AC-04 十项 / AC-05 / AC-09 / 10 / 11） --------------------- */

const PHASE4_WORKDIR = join(homedir(), '.portgate-probes', 'phase4')
const PHASE4_HTTP_PORT = 18193
const PHASE4_FORCE_PORT = 18194

/** 忽略 SIGTERM 的最小 TCP 监听器（AC-11 强制结束兜底验证） */
const PHASE4_IGNORE_TERM_C = `#include <signal.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
int main(int argc, char **argv) {
  int port = argc > 1 ? atoi(argv[1]) : 18194;
  signal(SIGTERM, SIG_IGN);
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons((unsigned short)port);
  if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) return 1;
  if (listen(fd, 4) != 0) return 1;
  for (;;) {
    int client = accept(fd, 0, 0);
    if (client >= 0) { close(client); }
  }
}
`

function probeWhichNode(): string {
  // PATH 解析启动的进程，ps comm 可能回退短名（无完整可执行路径）→ 探针用绝对路径 spawn
  const result = spawnSync('which', ['node'])
  const nodePath = result.stdout.toString().trim()
  return nodePath.length > 0 ? nodePath : 'node'
}

function spawnHttpListener(nodeBin: string, port: number, cwd: string): ChildProcess {
  return spawn(
    nodeBin,
    ['-e', `require('http').createServer((q,s)=>s.end('ok')).listen(${port}, '127.0.0.1')`],
    { cwd, stdio: 'ignore' }
  )
}

async function waitPortGone(manager: PortManager, protocol: 'TCP' | 'UDP', port: number, attempts = 4): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { records } = await manager.scanCycle()
    const present = records.some((record) => record.protocol === protocol && record.localPort === port)
    if (!present) {
      return true
    }
    await sleepProbe(400)
  }
  return false
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 阶段 4 真机核对（方案 §7 阶段 4）：
 * - AC-04 十项终验：Application/Project 实识别（八项已由阶段 3 探针覆盖）；
 * - AC-05 实树抽查：探针 node 的宿主应用经真实进程树识别（dev 链路宿主为 Electron.app）；
 * - AC-09：普通用户进程 SIGTERM 终止闭环（DONE → 复扫消失 → 进程退出）；
 * - AC-10：SYSTEM/SYSTEM_CRITICAL/UNKNOWN 级进程终止被拒（System Protected，不发信号不动真实系统进程）；
 * - AC-11：SIGTERM 忽略进程 → 3s 宽限 → PENDING_FORCE → force SIGKILL → DONE。
 */
function log4(line: string): void {
  console.log(`[portgate] [PHASE4] ${line}`)
}

export async function runPhase4Probe(manager: PortManager, killPolicy: KillPolicy): Promise<void> {
  const children: ChildProcess[] = []
  let failures = 0
  try {
    mkdirSync(PHASE4_WORKDIR, { recursive: true })
    writeFileSync(join(PHASE4_WORKDIR, 'package.json'), JSON.stringify({ name: 'pg-phase4-probe', private: true }))

    // ---- AC-04 十项（9/10）：Application + Project 实识别 ----
    const httpChild = spawnHttpListener(probeWhichNode(), PHASE4_HTTP_PORT, PHASE4_WORKDIR)
    children.push(httpChild)
    await sleepProbe(400)
    const record = await waitForPortRecord(manager, 'TCP', PHASE4_HTTP_PORT)
    const projectOk =
      record.project?.name === 'pg-phase4-probe' &&
      record.project.type === 'node' &&
      record.project.marker === 'package.json' &&
      record.project.path === PHASE4_WORKDIR
    log4(`AC04-9 Project name=${JSON.stringify(record.project?.name)} type=${record.project?.type} marker=${record.project?.marker} ok=${projectOk}`)
    if (!projectOk) failures += 1

    const applicationOk =
      record.application !== undefined &&
      record.application.name === 'Electron' &&
      (record.application.path ?? '').endsWith('.app') &&
      record.application.sourcePid !== undefined
    log4(
      `AC04-10 Application name=${JSON.stringify(record.application?.name)} path=${JSON.stringify(record.application?.path)} ` +
        `bundleId=${JSON.stringify(record.application?.bundleId)} ok=${applicationOk}（AC-05 实树：node 的宿主应用经真实进程树识别）`
    )
    if (!applicationOk) failures += 1

    // ---- AC-09：USER 进程 SIGTERM 终止闭环 ----
    const termResult = await killPolicy.terminate(record.recordId)
    const exited = termResult.status === 'DONE' && !pidAlive(record.pid)
    const goneFromSnapshot = await waitPortGone(manager, 'TCP', PHASE4_HTTP_PORT)
    log4(
      `AC09 terminate status=${termResult.status} reason=${termResult.denyReason ?? "-"} level=${termResult.protectionLevel ?? "-"} detail=${termResult.detail ?? "-"} ` +
        `pidAlive=${pidAlive(record.pid)} removedFromSnapshot=${goneFromSnapshot} ok=${exited && goneFromSnapshot}`
    )
    if (!(exited && goneFromSnapshot)) failures += 1

    // ---- AC-10：非 USER 级拒绝（System Protected；不发信号，不动真实系统进程） ----
    const { records: snapshot } = await manager.scanCycle()
    const protectedRecord = snapshot.find(
      (item) => item.security.level !== 'USER' && item.security.level !== undefined
    )
    if (protectedRecord === undefined) {
      log4('AC10 SKIP：当前快照无非 USER 监听记录（少见）')
      failures += 1
    } else {
      const deny = await killPolicy.terminate(protectedRecord.recordId)
      const denyOk =
        deny.status === 'DENIED' &&
        deny.denyReason === 'PROTECTED' &&
        deny.protectionLevel === protectedRecord.security.level
      log4(
        `AC10 deny recordId=${protectedRecord.recordId} level=${protectedRecord.security.level} ` +
          `status=${deny.status} reason=${deny.denyReason} matchedLevel=${deny.protectionLevel} ok=${denyOk}`
      )
      if (!denyOk) failures += 1
    }

    // ---- AC-11：SIGTERM 忽略进程 → PENDING_FORCE → force SIGKILL → DONE ----
    const forceSourcePath = join(PHASE4_WORKDIR, 'ignore-term.c')
    const forceBinaryPath = join(PHASE4_WORKDIR, 'ignore-term-srv')
    writeFileSync(forceSourcePath, PHASE4_IGNORE_TERM_C)
    const compile = spawnSync('cc', ['-O2', '-o', forceBinaryPath, forceSourcePath])
    if (compile.status !== 0) {
      throw new Error(`ignore-term listener compile failed: ${String(compile.stderr)}`)
    }
    const forceChild = spawn(forceBinaryPath, [String(PHASE4_FORCE_PORT)], { stdio: 'ignore' })
    children.push(forceChild)
    await sleepProbe(400)
    const forceRecord = await waitForPortRecord(manager, 'TCP', PHASE4_FORCE_PORT)
    const pending = await killPolicy.terminate(forceRecord.recordId)
    const pendingOk = pending.status === 'PENDING_FORCE' && pidAlive(recordForcePid(forceChild))
    log4(`AC11 terminate on SIGTERM-ignoring proc status=${pending.status} reason=${pending.denyReason ?? "-"} level=${pending.protectionLevel ?? "-"} ok=${pendingOk}`)
    if (!pendingOk) failures += 1
    const forceResult = await killPolicy.forceTerminate(forceRecord.recordId)
    await sleepProbe(300) // SIGKILL 信号送达与进程回收异步，稍候再断言
    const forceOk = forceResult.status === 'DONE' && !pidAlive(recordForcePid(forceChild))
    const forceGone = await waitPortGone(manager, 'TCP', PHASE4_FORCE_PORT)
    log4(
      `AC11 force status=${forceResult.status} pidAlive=${pidAlive(recordForcePid(forceChild))} ` +
        `removedFromSnapshot=${forceGone} ok=${forceOk && forceGone}`
    )
    if (!(forceOk && forceGone)) failures += 1
  } catch (error) {
    failures += 1
    log4(`phase4 probe aborted with error: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    for (const child of children) {
      try {
        if (child.pid !== undefined) {
          process.kill(child.pid, 'SIGKILL')
        }
      } catch {
        // 已退出忽略
      }
    }
    rmSync(PHASE4_WORKDIR, { recursive: true, force: true })
  }
  log4(`SUMMARY: ${failures === 0 ? 'PASS' : `FAIL (${failures} failures)`}`)
}

function recordForcePid(child: ChildProcess): number {
  const pid = child.pid
  if (pid === undefined) {
    return -1
  }
  return pid
}

/* -------------- 阶段 5 真机核对（AC-13 历史闭环 + 设置落库 + D-1 判据 B 输出） -------------- */

const PHASE5_WORKDIR = join(homedir(), '.portgate-probes', 'phase5')
const PHASE5_HTTP_PORT = 18195

function log5(line: string): void {
  console.log(`[portgate] [PHASE5] ${line}`)
}

/**
 * 阶段 5 真机核对（方案 §7 阶段 5）：
 * - AC-13 真机历史闭环：起真实端口 → 运行（PORT_OPENED 落库）→ 终止（DONE 写 closed_at）→
 *   port:history（LIKE 预筛 + 引擎评分）可查得该会话且时间区间/时长/项目识别正确；
 * - 历史 M 计数口径：取 port:history 返回条数；
 * - 设置运行时往返（落库）；重启恢复由 SETTINGS_WRITE / SETTINGS_ONLY 两阶段承担；
 * - D-1 判据 B 输出见 tests/unit/sqlite-load.test.ts 与主进程 [db] 打开日志。
 */
export async function runPhase5Probe(
  manager: PortManager,
  sessionStore: SessionStore,
  settingsStore: SettingsStore,
  killPolicy: KillPolicy
): Promise<void> {
  const children: ChildProcess[] = []
  let failures = 0
  try {
    mkdirSync(PHASE5_WORKDIR, { recursive: true })
    writeFileSync(join(PHASE5_WORKDIR, 'package.json'), JSON.stringify({ name: 'pg-phase5-probe', private: true }))
    const child = spawnHttpListener(probeWhichNode(), PHASE5_HTTP_PORT, PHASE5_WORKDIR)
    children.push(child)
    const pid = child.pid
    if (pid === undefined) {
      throw new Error('phase5 probe child failed to start')
    }
    await sleepProbe(400)
    const record = await waitForPortRecord(manager, 'TCP', PHASE5_HTTP_PORT)

    // 终止（DONE 写 closed_at：KillPolicy onExitConfirmed → sessionStore.close + PORT_CLOSED 事件幂等收口）
    const term = await killPolicy.terminate(record.recordId)
    const gone = await waitPortGone(manager, 'TCP', PHASE5_HTTP_PORT)
    if (!(term.status === 'DONE' && gone)) failures += 1

    // AC-13：历史可查（LIKE 预筛按项目名 + 引擎评分），时间区间/时长/字段正确
    const sessions = sessionStore.queryHistory('pg-phase5-probe')
    const session = sessions.find((item) => item.localPort === PHASE5_HTTP_PORT && item.protocol === 'TCP')
    if (session === undefined) {
      log5(`AC13 FAIL：queryHistory('pg-phase5-probe') 未查得 port=${PHASE5_HTTP_PORT} 会话（返回 ${sessions.length} 条）`)
      failures += 1
    } else {
      const closedAt = session.closedAt ?? 0
      const durationMs = closedAt - session.firstSeenAt
      const ac13Ok =
        session.firstSeenAt > 0 &&
        closedAt >= session.firstSeenAt &&
        session.lastSeenAt >= session.firstSeenAt &&
        closedAt >= session.lastSeenAt &&
        durationMs >= 0 &&
        durationMs <= 60_000 &&
        session.projectName === 'pg-phase5-probe' &&
        session.projectPath === PHASE5_WORKDIR &&
        session.processName === 'node' &&
        session.protocol === 'TCP' &&
        session.localAddress === '127.0.0.1' &&
        session.closedAt !== undefined
      log5(
        `AC13 session id=${session.id} interval=${session.firstSeenAt} -> ${closedAt} ` +
          `durationMs=${durationMs} project=${JSON.stringify(session.projectName)} ok=${ac13Ok}`
      )
      if (!ac13Ok) failures += 1
    }

    // 历史 M 计数口径：取 port:history 返回条数
    const countOk = sessions.length > 0
    log5(`history count (M) = ${sessions.length} ok=${countOk}`)
    if (!countOk) failures += 1

    // 端口数字关键词可检索（LIKE 跨拼接列）
    const byPort = sessionStore.queryHistory(String(PHASE5_HTTP_PORT))
    const byPortOk = byPort.some((item) => item.localPort === PHASE5_HTTP_PORT)
    log5(`history search by port keyword ok=${byPortOk}`)
    if (!byPortOk) failures += 1

    // 设置运行时往返（落库；重启恢复由 SETTINGS_WRITE / SETTINGS_ONLY 两阶段承担）
    const before = settingsStore.get()
    settingsStore.update({ scanInterval: 5000, theme: 'dark' })
    const after = settingsStore.get()
    const settingsOk = after.scanInterval === 5000 && after.theme === 'dark'
    log5(`settings runtime roundtrip scanInterval=${after.scanInterval} theme=${after.theme} ok=${settingsOk}`)
    if (!settingsOk) failures += 1
    settingsStore.update({ scanInterval: before.scanInterval, theme: before.theme })
  } catch (error) {
    failures += 1
    log5(`phase5 probe aborted with error: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    for (const child of children) {
      try {
        if (child.pid !== undefined) {
          process.kill(child.pid, 'SIGKILL')
        }
      } catch {
        // 已退出忽略
      }
    }
    rmSync(PHASE5_WORKDIR, { recursive: true, force: true })
  }
  log5(`SUMMARY: ${failures === 0 ? 'PASS' : `FAIL (${failures} failures)`}`)
}
