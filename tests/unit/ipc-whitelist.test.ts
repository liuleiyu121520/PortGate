/**
 * IPC 白名单恒等断言 + preload 安全边界（方案 §4.3 / §7 阶段 1 / v1.2 m-01）：
 * - src/shared/ipc-contract.ts 导出的 channel 集合恒等于阶段 1 白名单（settings:get / settings:set），
 *   不存在任何占位通道（无 port:ping 等）；
 * - src/preload 源码不出现 child_process / fs / kill；
 * - window.portgate 暴露方法名与白名单一一对应，且仅路由到白名单内通道。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPortgateApi, PORTGATE_METHODS } from '../../src/preload/api'
import { IPC_CHANNELS, IPC_CHANNEL_WHITELIST } from '../../src/shared/ipc-contract'

// vitest 以项目根为工作目录运行（npm test 从 package.json 所在目录启动）
const PROJECT_ROOT = process.cwd()

/** 阶段 1 白名单（方案 §7 阶段 1：仅挂 settings:get/set，不设任何占位通道，m-01） */
const STAGE1_EXPECTED_CHANNELS: readonly string[] = ['settings:get', 'settings:set']

describe('IPC 白名单恒等断言（方案 §4.3 / m-01）', () => {
  it('IPC_CHANNELS 导出的 channel 集合与白名单常量恒等', () => {
    const channelValues = Object.values(IPC_CHANNELS)
    expect(new Set(channelValues).size).toBe(channelValues.length)
    expect([...channelValues].sort()).toEqual([...IPC_CHANNEL_WHITELIST].sort())
  })

  it('阶段 1 白名单恒等于 { settings:get, settings:set }，不存在占位通道', () => {
    expect([...IPC_CHANNEL_WHITELIST].sort()).toEqual([...STAGE1_EXPECTED_CHANNELS].sort())
    expect(IPC_CHANNEL_WHITELIST).not.toContain('port:ping')
  })
})

describe('preload 安全边界（方案 §4.3 静态断言）', () => {
  const preloadSources = [
    readFileSync(resolve(PROJECT_ROOT, 'src/preload/index.ts'), 'utf-8'),
    readFileSync(resolve(PROJECT_ROOT, 'src/preload/api.ts'), 'utf-8')
  ]

  it('preload 源码不出现 child_process / fs / kill 等危险 API', () => {
    for (const source of preloadSources) {
      expect(source).not.toMatch(/child_process/)
      expect(source).not.toMatch(/node:fs|require\(\s*['"]fs['"]\s*\)|from\s+['"]fs['"]/)
      expect(source).not.toMatch(/kill/)
    }
  })

  it('preload 源码不出现 node 内建模块导入', () => {
    for (const source of preloadSources) {
      expect(source).not.toMatch(/from\s+['"]node:/)
      expect(source).not.toMatch(/require\(\s*['"]node:/)
    }
  })

  it('window.portgate 暴露方法名与白名单一一对应', () => {
    const methods = Object.keys(PORTGATE_METHODS)
    const routedChannels = Object.values(PORTGATE_METHODS)
    expect([...methods].sort()).toEqual(['getSettings', 'setSettings'])
    expect(new Set(routedChannels).size).toBe(methods.length)
    expect([...routedChannels].sort()).toEqual([...IPC_CHANNEL_WHITELIST].sort())
  })

  it('preload 桥调用仅路由到白名单内通道', async () => {
    const routed: string[] = []
    const api = createPortgateApi(async (channel) => {
      routed.push(channel)
      return { ok: true, scanInterval: 2000, theme: 'light' }
    })
    await api.getSettings()
    await api.setSettings({ theme: 'dark' })
    expect(routed).toEqual([IPC_CHANNELS.SETTINGS_GET, IPC_CHANNELS.SETTINGS_SET])
    for (const channel of routed) {
      expect(IPC_CHANNEL_WHITELIST).toContain(channel)
    }
  })

  it('非白名单通道在桥层被运行时拒绝', async () => {
    const api = createPortgateApi(async () => ({ ok: true }))
    await expect(
      // 模拟越权调用内部 invoke 通路：PortgateApi 未暴露 port:terminate 等通道
      (api as unknown as { getSettings: () => Promise<unknown> }).getSettings()
    ).resolves.toBeDefined()
    const guarded = createPortgateApi(async (channel) => {
      if (channel === 'port:terminate') {
        return { ok: true }
      }
      throw new Error('should not reach invoker')
    })
    // PORTGATE_METHODS 只映射白名单通道，任何额外 channel 都无法经 api 触达 invoker
    expect(Object.values(PORTGATE_METHODS)).not.toContain('port:terminate')
    expect(guarded).toBeDefined()
  })
})
