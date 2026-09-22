/**
 * ProcessResolver 测试（方案 §5.6）：
 * 全量表刷新、沿 PPID 上溯（深度上限 / ppid≤1 止）、工作目录缓存（pid 消失清缓存、
 * missingCwdPids 仅报未缓存者）。
 */
import { describe, expect, it } from 'vitest'
import type { RawProcess } from '../../src/main/platform/types'
import { ProcessResolver } from '../../src/main/core/resolve/ProcessResolver'

function mkProc(pid: number, ppid: number, name: string): RawProcess {
  return {
    pid,
    ppid,
    uid: 501,
    user: 'leiyu',
    startedAt: 0,
    cpuPercent: 0,
    memPercent: 0,
    executablePath: `/usr/local/bin/${name}`,
    commandLine: name
  }
}

/** 方案 §5.7 实树形态：node→npm→zsh→login→iTerm2 */
function buildTree(): RawProcess[] {
  return [
    mkProc(100, 200, 'node'),
    mkProc(200, 300, 'npm'),
    mkProc(300, 400, 'zsh'),
    mkProc(400, 500, 'login'),
    mkProc(500, 1, 'iTerm2')
  ]
}

describe('全量表持有与查询', () => {
  it('refresh 后 get(pid) 返回最新进程', () => {
    const resolver = new ProcessResolver()
    resolver.refresh(buildTree())
    expect(resolver.get(100)?.executablePath).toBe('/usr/local/bin/node')
    expect(resolver.get(404)).toBeUndefined()
  })
})

describe('进程树上溯（§5.6/§5.7）', () => {
  it('沿 PPID 上溯至 ppid≤1 止，含自身（node→npm→zsh→login→iTerm2）', () => {
    const resolver = new ProcessResolver()
    resolver.refresh(buildTree())
    const chain = resolver.getTree(100)
    expect(chain.map((proc) => proc.pid)).toEqual([100, 200, 300, 400, 500])
  })

  it('ppid=1 的顶层进程只含自身', () => {
    const resolver = new ProcessResolver()
    resolver.refresh(buildTree())
    expect(resolver.getTree(500).map((proc) => proc.pid)).toEqual([500])
  })

  it('深度上限 32 保护环路', () => {
    const loop = [mkProc(1, 2, 'a'), mkProc(2, 1, 'b')]
    const resolver = new ProcessResolver()
    resolver.refresh(loop)
    const chain = resolver.getTree(1, 32)
    expect(chain.length).toBeLessThanOrEqual(32)
  })
})

describe('工作目录缓存（§5.6）', () => {
  it('setCwd/getCwd 与 missingCwdPids 仅报未缓存者', () => {
    const resolver = new ProcessResolver()
    resolver.setCwd(100, '/Users/leiyu/code/github/PortGate')
    expect(resolver.getCwd(100)).toBe('/Users/leiyu/code/github/PortGate')
    expect(resolver.missingCwdPids([100, 200])).toEqual([200])
  })

  it('pid 不在下一轮全量表时清缓存（§5.6 失效规则）', () => {
    const resolver = new ProcessResolver()
    resolver.refresh(buildTree())
    resolver.setCwd(100, '/tmp/project')
    resolver.refresh([mkProc(200, 1, 'other')])
    expect(resolver.getCwd(100)).toBeUndefined()
    expect(resolver.getCwd(200)).toBeUndefined()
    expect(resolver.missingCwdPids([200])).toEqual([200])
  })
})
