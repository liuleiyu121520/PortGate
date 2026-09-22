/**
 * ApplicationResolver 测试（方案 §5.7 / 需求 §9.1，AC-05）：
 * process-tree.json 实树上溯（node→npm→zsh→login→iTerm2）、GUI 进程自身直返、
 * 未命中 undefined（字段位保留）、bundleId 受限正则提取（临时 .app 结构）。
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RawProcess } from '../../src/main/core/../platform/types'
import { ApplicationResolver, extractAppBundle } from '../../src/main/core/resolve/ApplicationResolver'

interface TreeFixture {
  processes: RawProcess[]
}

function loadTree(): RawProcess[] {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/process-tree.json'), 'utf-8')) as TreeFixture
  return raw.processes
}

function toMap(processes: readonly RawProcess[]): Map<number, RawProcess> {
  return new Map(processes.map((proc) => [proc.pid, proc]))
}

/** 收集 pid 的祖先链（含自身，ppid≤1 止）——与 ProcessResolver.getTree 同语义 */
function collectAncestry(map: Map<number, RawProcess>, pid: number): RawProcess[] {
  const chain: RawProcess[] = []
  let current = map.get(pid)
  let depth = 0
  while (current !== undefined && depth < 32) {
    chain.push(current)
    if (current.ppid <= 1) {
      break
    }
    current = map.get(current.ppid)
    depth += 1
  }
  return chain
}

describe('实树上溯（process-tree.json，AC-05）', () => {
  it('node→npm→zsh→login→iTerm2：宿主应用为 iTerm（name 去后缀/path 为 .app 目录）', () => {
    const processes = loadTree()
    const resolver = new ApplicationResolver({ readPlist: () => undefined })
    const tree = collectAncestry(toMap(processes), 100)
    expect(tree.map((proc) => proc.pid)).toEqual([100, 200, 300, 400, 500])
    const application = resolver.resolve(tree)
    expect(application).toEqual({
      name: 'iTerm',
      path: '/Applications/iTerm.app',
      bundleId: undefined,
      sourcePid: 500
    })
  })

  it('GUI 进程自身即宿主应用（iTerm2 自身直接返回）', () => {
    const processes = loadTree()
    const resolver = new ApplicationResolver({ readPlist: () => undefined })
    const application = resolver.resolve([processes[4]])
    expect(application?.name).toBe('iTerm')
    expect(application?.sourcePid).toBe(500)
  })

  it('树中无 .app（纯命令行链）→ undefined（字段位保留）', () => {
    const plain: RawProcess[] = [
      { pid: 10, ppid: 1, uid: 501, user: 'leiyu', startedAt: 0, cpuPercent: 0, memPercent: 0, executablePath: '/usr/local/bin/node', commandLine: 'node' }
    ]
    const resolver = new ApplicationResolver({ readPlist: () => undefined })
    expect(resolver.resolve(plain)).toBeUndefined()
  })

  it('collectAncestry 与 ProcessResolver.getTree 同语义（ppid≤1 止 + 深度保护）', () => {
    const map = toMap(loadTree())
    expect(collectAncestry(map, 500).map((proc) => proc.pid)).toEqual([500])
  })
})

describe('extractAppBundle', () => {
  it('提取 .app 目录（首个 .app 结尾处截断）', () => {
    expect(extractAppBundle('/Applications/iTerm.app/Contents/MacOS/iTerm2')).toBe('/Applications/iTerm.app')
    expect(extractAppBundle('/Users/x/My App.app/Contents/MacOS/My App')).toBe('/Users/x/My App.app')
  })

  it('非 .app 路径返回 null', () => {
    expect(extractAppBundle('/usr/local/bin/node')).toBeNull()
  })
})

describe('bundleId 提取（R-03：尽力读取，失败为空）', () => {
  it('临时 .app 结构：读取 Contents/Info.plist 的 CFBundleIdentifier', () => {
    const root = mkdtempSync(join(tmpdir(), 'pg-app-'))
    try {
      const appDir = join(root, 'Probe.app')
      mkdirSync(join(appDir, 'Contents', 'MacOS'), { recursive: true })
      writeFileSync(
        join(appDir, 'Contents', 'Info.plist'),
        '<?xml version="1.0"?>\n<plist>\n<dict>\n<key>CFBundleIdentifier</key>\n<string>com.probe.term</string>\n</dict>\n</plist>\n'
      )
      writeFileSync(join(appDir, 'Contents', 'MacOS', 'Probe'), '#!/bin/sh\n')
      const resolver = new ApplicationResolver()
      const tree: RawProcess[] = [
        { pid: 20, ppid: 1, uid: 501, user: 'leiyu', startedAt: 0, cpuPercent: 0, memPercent: 0, executablePath: join(appDir, 'Contents', 'MacOS', 'Probe'), commandLine: 'Probe' }
      ]
      const application = resolver.resolve(tree)
      expect(application).toEqual({
        name: 'Probe',
        path: appDir,
        bundleId: 'com.probe.term',
        sourcePid: 20
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('Info.plist 缺失/无 CFBundleIdentifier → bundleId 为 undefined（不失败）', () => {
    const root = mkdtempSync(join(tmpdir(), 'pg-app-'))
    try {
      const appDir = join(root, 'NoPlist.app')
      mkdirSync(join(appDir, 'Contents', 'MacOS'), { recursive: true })
      writeFileSync(join(appDir, 'Contents', 'Info.plist'), '<plist><dict></dict></plist>')
      const resolver = new ApplicationResolver()
      const tree: RawProcess[] = [
        { pid: 21, ppid: 1, uid: 501, user: 'leiyu', startedAt: 0, cpuPercent: 0, memPercent: 0, executablePath: join(appDir, 'Contents', 'MacOS', 'Bin'), commandLine: 'Bin' }
      ]
      const application = resolver.resolve(tree)
      expect(application?.name).toBe('NoPlist')
      expect(application?.bundleId).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
