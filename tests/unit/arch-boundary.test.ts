/**
 * 架构边界守护测试（方案 §8.1 架构守护域 / AC-16，阶段 2 平台隔离成型）：
 * - 业务层（core/ipc/db/preload/renderer）源码禁 child_process / netstat / 平台扫描命令字样
 *   （平台能力收敛于 src/main/platform/）；
 * - process.platform 仅允许存在于 src/main/platform/（ESLint no-restricted-properties 同口径双保险）；
 * - renderer 禁 import electron / node 内建模块；
 * - 适配器工厂按平台分发：darwin → MacAdapter，win32/linux → 降级 stub（R-01）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAdapter } from '../../src/main/platform/factory'
import { MacAdapter } from '../../src/main/platform/mac/MacAdapter'
import { WindowsAdapter } from '../../src/main/platform/windows/WindowsAdapter'
import { LinuxAdapter } from '../../src/main/platform/linux/LinuxAdapter'

const PROJECT_ROOT = process.cwd()
const SOURCE_EXTS = new Set(['.ts', '.vue'])

/** 架构扫描范围（业务层 + 边界层；platform/ 与 dev 探针、组装入口 index.ts 豁免） */
const SCAN_DIRS = ['src/main/core', 'src/main/db', 'src/main/ipc', 'src/preload', 'src/renderer']
const FORBIDDEN_TOKENS = ['child_process', 'netstat', 'lsof']

function walkSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walkSources(full))
    } else if (SOURCE_EXTS.has(full.slice(full.lastIndexOf('.')))) {
      out.push(full)
    }
  }
  return out
}

describe('业务层平台能力收敛（AC-16 / §8.1 架构守护）', () => {
  it('业务层源码不出现 child_process / netstat / 平台扫描命令字样', () => {
    for (const dir of SCAN_DIRS) {
      for (const file of walkSources(resolve(PROJECT_ROOT, dir))) {
        const source = readFileSync(file, 'utf-8')
        for (const token of FORBIDDEN_TOKENS) {
          expect(
            source.includes(token),
            `${file} 不应包含「${token}」（平台能力收敛于 src/main/platform/）`
          ).toBe(false)
        }
      }
    }
  })

  it('process.platform 仅存在于 src/main/platform/（平台分支唯一合法位置）', () => {
    const files = walkSources(resolve(PROJECT_ROOT, 'src')).filter((file) => {
      const normalized = file.replaceAll('\\', '/')
      if (normalized.includes('/src/main/platform/')) {
        return false
      }
      return SOURCE_EXTS.has(file.slice(file.lastIndexOf('.')))
    })
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      expect(
        source.includes('process.platform'),
        `${file} 使用了 process.platform（仅允许 src/main/platform/，AC-16）`
      ).toBe(false)
    }
  })

  it('renderer 源码不 import electron / node 内建模块', () => {
    const rendererFiles = walkSources(resolve(PROJECT_ROOT, 'src/renderer'))
    expect(rendererFiles.length).toBeGreaterThan(0)
    for (const file of rendererFiles) {
      const source = readFileSync(file, 'utf-8')
      expect(source).not.toMatch(/from\s+['"]electron/)
      expect(source).not.toMatch(/from\s+['"]node:/)
      expect(source).not.toMatch(/from\s+['"](fs|path|os|crypto|child_process|net|http)['"]/)
    }
  })
})

describe('适配器工厂平台分发（需求 §13 / R-01）', () => {
  it('darwin → MacAdapter', () => {
    expect(createAdapter('darwin')).toBeInstanceOf(MacAdapter)
  })

  it('win32 / linux → 降级 stub（V1 功能降级占位）', () => {
    expect(createAdapter('win32')).toBeInstanceOf(WindowsAdapter)
    expect(createAdapter('linux')).toBeInstanceOf(LinuxAdapter)
  })

  it('stub 扫描返回空快照、终止抛 AdapterError（不崩溃）', async () => {
    const stub = createAdapter('win32')
    await expect(stub.scanPorts()).resolves.toEqual([])
    await expect(stub.getProcessTable()).resolves.toEqual([])
    await expect(stub.terminateProcess(1)).rejects.toThrow()
  })
})
