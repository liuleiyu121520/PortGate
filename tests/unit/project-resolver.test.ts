/**
 * ProjectResolver 测试（方案 §5.8 / 需求 §9.2，AC-06）：
 * 多 marker 层级与优先级、各类型名称提取（package.json/settings.gradle/pom.xml/Cargo.toml/
 * go.mod/pyproject.toml）、目录名兜底、多级父目录上溯、越 HOME 边界止、无 marker 空、
 * (pid, cwd) 缓存与失效。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectResolver } from '../../src/main/core/resolve/ProjectResolver'

const cleanup: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pg-proj-'))
  cleanup.push(root)
  return root
}

afterEach(() => {
  for (const root of cleanup.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('marker 命中与名称提取（受限正则）', () => {
  it('package.json：读 name 字段，type=node，marker 记录命中文件', () => {
    const root = makeRoot()
    const project = join(root, 'ci-buddy')
    mkdirSync(join(project, 'apps', 'web'), { recursive: true })
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'ci-buddy-web' }))
    const resolver = new ProjectResolver(root)
    const info = resolver.resolve(1, join(project, 'apps', 'web'))
    expect(info).toEqual({ name: 'ci-buddy-web', path: project, type: 'node', marker: 'package.json' })
  })

  it('settings.gradle：rootProject.name 提取', () => {
    const root = makeRoot()
    const project = join(root, 'java-app')
    mkdirSync(project, { recursive: true })
    writeFileSync(join(project, 'settings.gradle'), "rootProject.name = 'api-gateway'\n")
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(2, project)?.name).toBe('api-gateway')
  })

  it('pom.xml：artifactId 提取', () => {
    const root = makeRoot()
    const project = join(root, 'maven-app')
    mkdirSync(project, { recursive: true })
    writeFileSync(join(project, 'pom.xml'), '<project>\n  <artifactId>order-service</artifactId>\n</project>\n')
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(3, project)?.name).toBe('order-service')
  })

  it('Cargo.toml：[package] 段内 name 提取', () => {
    const root = makeRoot()
    const project = join(root, 'rust-app')
    mkdirSync(project, { recursive: true })
    writeFileSync(
      join(project, 'Cargo.toml'),
      '[package]\nname = "portgate-core"\nversion = "0.1.0"\n\n[[bin]]\nname = "other"\n'
    )
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(4, project)?.name).toBe('portgate-core')
    expect(resolver.resolve(4, project)?.type).toBe('rust')
  })

  it('go.mod：module 路径末段提取', () => {
    const root = makeRoot()
    const project = join(root, 'go-app')
    mkdirSync(project, { recursive: true })
    writeFileSync(join(project, 'go.mod'), 'module github.com/acme/gw-server\n\ngo 1.22\n')
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(5, project)?.name).toBe('gw-server')
    expect(resolver.resolve(5, project)?.type).toBe('go')
  })

  it('pyproject.toml：name 提取', () => {
    const root = makeRoot()
    const project = join(root, 'py-app')
    mkdirSync(project, { recursive: true })
    writeFileSync(join(project, 'pyproject.toml'), '[tool.poetry]\nname = "etl-worker"\n')
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(6, project)?.name).toBe('etl-worker')
    expect(resolver.resolve(6, project)?.type).toBe('python')
  })

  it('无内容提取型 marker（.git）→ 目录名兜底，type=git', () => {
    const root = makeRoot()
    const project = join(root, 'plain-repo')
    mkdirSync(join(project, '.git'), { recursive: true })
    const resolver = new ProjectResolver(root)
    const info = resolver.resolve(7, project)
    expect(info?.name).toBe('plain-repo')
    expect(info?.type).toBe('git')
    expect(info?.marker).toBe('.git')
  })

  it('提取失败（空 package.json）→ 目录名兜底', () => {
    const root = makeRoot()
    const project = join(root, 'fallback-name')
    mkdirSync(project, { recursive: true })
    writeFileSync(join(project, 'package.json'), '{}')
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(8, project)?.name).toBe('fallback-name')
  })
})

describe('上溯边界（方案 §5.8）', () => {
  it('多级父目录上溯：work/inner 命中根项目 marker', () => {
    const root = makeRoot()
    const project = join(root, 'mono')
    mkdirSync(join(project, 'work', 'inner'), { recursive: true })
    writeFileSync(join(project, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
    const resolver = new ProjectResolver(root)
    const info = resolver.resolve(10, join(project, 'work', 'inner'))
    expect(info?.path).toBe(project)
    expect(info?.marker).toBe('pnpm-workspace.yaml')
  })

  it('越 HOME 边界即停：HOME 外不误判', () => {
    const root = makeRoot()
    const outside = makeRoot()
    const project = join(outside, 'outer-project')
    mkdirSync(join(project, 'sub'), { recursive: true })
    writeFileSync(join(project, 'package.json'), '{"name":"should-not-match"}')
    const resolver = new ProjectResolver(root)
    // workdir 在 HOME 外 → 不搜索，返回 undefined
    expect(resolver.resolve(11, join(project, 'sub'))).toBeUndefined()
  })

  it('无任何 marker → undefined（字段位保留）', () => {
    const root = makeRoot()
    const plain = join(root, 'plain', 'deep')
    mkdirSync(plain, { recursive: true })
    const resolver = new ProjectResolver(root)
    expect(resolver.resolve(12, plain)).toBeUndefined()
  })
})

describe('(pid, cwd) 缓存（方案 §5.8）', () => {
  it('同 (pid, cwd) 复用缓存；cwd 变化重新解析；invalidate 失效', () => {
    const root = makeRoot()
    const project = join(root, 'cached')
    mkdirSync(join(project, 'a', 'b'), { recursive: true })
    writeFileSync(join(project, 'package.json'), '{"name":"cached-proj"}')
    const resolver = new ProjectResolver(root)
    const cwdA = join(project, 'a')
    const cwdB = join(project, 'a', 'b')
    const first = resolver.resolve(20, cwdA)
    expect(first?.name).toBe('cached-proj')
    expect(resolver.resolve(20, cwdA)).toBe(first)
    // 不同 pid 同 cwd：独立缓存条目
    expect(resolver.resolve(21, cwdA)?.name).toBe('cached-proj')
    // cwd 变化：新解析（更近目录无 marker → 上溯到 project）
    const fromB = resolver.resolve(20, cwdB)
    expect(fromB?.name).toBe('cached-proj')
    expect(fromB).not.toBe(first)
    // invalidate 后重新解析产生新对象
    resolver.invalidate(20, cwdA)
    expect(resolver.resolve(20, cwdA)).not.toBe(first)
    // invalidate（仅 pid）清除该 pid 全部条目
    resolver.invalidate(21)
    expect(resolver.resolve(21, cwdA)).not.toBe(first)
  })
})
