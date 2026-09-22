/**
 * 监听端口机器格式解析器测试（方案 §5.3 / M-01，fixture 驱动）：
 * 协议归属自 P 字段、TST= 提取、TQR/TQS 噪声容错、同进程多 socket 去重、
 * UDP `*:*` 丢弃、缺 P 行丢弃并告警、TCP 非 LISTEN 丢弃、f/g/未知前缀忽略、IPv6 去括号。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCwdOutput, parseLsofMachineOutput } from '../../src/main/platform/mac/lsofParser'

// fixture 用字面 `\0`（反斜杠+0）书写，加载时替换为真实 NUL（行分隔符与 NUL 同为 token 边界）
function loadFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf-8').replaceAll('\\0', '\0')
}

const SCAN = parseLsofMachineOutput(loadFixture('lsof-scan.txt'))

describe('合并扫描解析（lsof-scan.txt / M-01）', () => {
  it('协议归属自 P 字段：TCP 与 UDP 条目正确分列', () => {
    const tcp = SCAN.ports.filter((p) => p.protocol === 'TCP')
    const udp = SCAN.ports.filter((p) => p.protocol === 'UDP')
    expect(tcp).toHaveLength(3)
    expect(udp).toHaveLength(2)
  })

  it('TCP 状态取自 TST= 子字段；TQR/TQS 噪声被忽略', () => {
    const entry = SCAN.ports.find((p) => p.localPort === 5173)
    expect(entry?.state).toBe('LISTEN')
    const udpEntry = SCAN.ports.find((p) => p.localPort === 5353)
    expect(udpEntry?.state).toBeNull()
  })

  it('同进程双 fd 同端口按 (pid, protocol, addr, port) 去重', () => {
    // fixture 中 *:3000 出现两次（f29 同组 + f31 跨组）
    const port3000 = SCAN.ports.filter((p) => p.localPort === 3000)
    expect(port3000).toHaveLength(1)
    expect(port3000[0]).toMatchObject({ pid: 81234, protocol: 'TCP', localAddress: '*' })
  })

  it('同进程组内多条 socket 均产出（127.0.0.1:5173 与 *:3000）', () => {
    const pidPorts = SCAN.ports.filter((p) => p.pid === 81234)
    expect(pidPorts).toHaveLength(3)
  })

  it('UDP `*:*`（无端口）条目被丢弃', () => {
    expect(SCAN.ports.find((p) => Number.isNaN(p.localPort))).toBeUndefined()
    expect(SCAN.ports.find((p) => p.pid === 44444)).toBeUndefined()
  })

  it('缺 P 字段的 socket 被丢弃并计入解析告警（防协议误判）', () => {
    expect(SCAN.ports.find((p) => p.pid === 77777)).toBeUndefined()
    expect(SCAN.warnings.length).toBeGreaterThanOrEqual(1)
    expect(SCAN.warnings.some((w) => w.includes('77777'))).toBe(true)
  })

  it('TCP state≠LISTEN 的条目被防御性丢弃（命令已过滤）', () => {
    expect(SCAN.ports.find((p) => p.pid === 88888)).toBeUndefined()
  })

  it('f 与未知前缀（g）被忽略；c 更新进程命令名', () => {
    const node = SCAN.ports.find((p) => p.localPort === 5174)
    expect(node?.command).toBe('node')
    const first = SCAN.ports.find((p) => p.localPort === 5173)
    expect(first?.command).toBe('node')
    const mdns = SCAN.ports.find((p) => p.localPort === 5353)
    expect(mdns?.command).toBe('mDNSResponder')
  })

  it('IPv6 地址去方括号：[::1]:8080 → localAddress ::1', () => {
    const ipv6 = SCAN.ports.find((p) => p.localPort === 8080)
    expect(ipv6?.localAddress).toBe('::1')
    expect(ipv6?.protocol).toBe('TCP')
    expect(ipv6?.state).toBe('LISTEN')
  })

  it('wildcard `*` 地址原样保留（exposure 层负责归类）', () => {
    expect(SCAN.ports.find((p) => p.localPort === 3000)?.localAddress).toBe('*')
  })

  it('真实 NUL 分隔输入（无换行）解析等价', () => {
    const rawNul = 'p1000\0cweb\0PTCP\0n0.0.0.0:8080\0TST=LISTEN\0TQR=0\0'
    const result = parseLsofMachineOutput(rawNul)
    expect(result.ports).toHaveLength(1)
    expect(result.ports[0]).toMatchObject({
      pid: 1000,
      protocol: 'TCP',
      localAddress: '0.0.0.0',
      localPort: 8080,
      state: 'LISTEN'
    })
    expect(result.warnings).toHaveLength(0)
  })
})

describe('批量工作目录解析（lsof-cwd.txt）', () => {
  it('p 开组、组内 n 为该进程 cwd；含空格路径整段保留', () => {
    const cwd = parseCwdOutput(loadFixture('lsof-cwd.txt'))
    expect(cwd.get(81234)).toBe('/Users/leiyu/code/github/PortGate')
    expect(cwd.get(33066)).toBe('/private/var/db/diagnostics')
    expect(cwd.get(40012)).toBe('/Applications/My App.app/Contents/Resources')
    expect(cwd.size).toBe(3)
  })
})
