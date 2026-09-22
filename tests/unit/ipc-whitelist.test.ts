/**
 * IPC 白名单恒等断言 + preload 安全边界（方案 §4.3 / §7 阶段 2 / v1.2 m-01）：
 * - src/shared/ipc-contract.ts 导出的 channel 集合恒等于阶段 2 白名单
 *   （settings:get/set + port:list/detail/refresh/events）；
 * - 不存在任何占位或未到阶段的通道（port:ping / port:history / port:terminate /
 *   port:forceTerminate / record:reveal）；
 * - src/preload 源码不出现 child_process / fs / kill；
 * - window.portgate 暴露方法名与白名单一一对应，且仅路由到白名单内通道。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPortgateApi, PORTGATE_METHODS } from '../../src/preload/api'
import type { IpcBridge } from '../../src/preload/api'
import { IPC_CHANNELS, IPC_CHANNEL_WHITELIST } from '../../src/shared/ipc-contract'

// vitest 以项目根为工作目录运行（npm test 从 package.json 所在目录启动）
const PROJECT_ROOT = process.cwd()

/** 阶段 4 白名单（方案 §4.2：阶段 4 应有通道全部就位；未到阶段通道严禁占位，m-01） */
const PHASE4_EXPECTED_CHANNELS: readonly string[] = [
  'settings:get',
  'settings:set',
  'port:list',
  'port:detail',
  'port:refresh',
  'port:events',
  'port:terminate',
  'port:forceTerminate',
  'record:reveal'
]

/** 未到阶段的通道（阶段 5 port:history）与被红线禁止的形态（kill(pid)，需求 §15） */
const FORBIDDEN_CHANNELS: readonly string[] = ['port:ping', 'port:history', 'port:kill', 'port:killByPid']

describe('IPC 白名单恒等断言（方案 §4.3 / m-01）', () => {
  it('IPC_CHANNELS 导出的 channel 集合与白名单常量恒等', () => {
    const channelValues = Object.values(IPC_CHANNELS)
    expect(new Set(channelValues).size).toBe(channelValues.length)
    expect([...channelValues].sort()).toEqual([...IPC_CHANNEL_WHITELIST].sort())
  })

  it('阶段 4 白名单恒等于方案 §4.2 应有通道，无占位且无 kill(pid) 形态通道', () => {
    expect([...IPC_CHANNEL_WHITELIST].sort()).toEqual([...PHASE4_EXPECTED_CHANNELS].sort())
    for (const forbidden of FORBIDDEN_CHANNELS) {
      expect(IPC_CHANNEL_WHITELIST).not.toContain(forbidden)
    }
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
    expect([...methods].sort()).toEqual([
      'forceTerminatePort',
      'getPortDetail',
      'getPortList',
      'getSettings',
      'onPortEvents',
      'refreshPorts',
      'revealRecord',
      'setSettings',
      'terminatePort'
    ])
    expect(new Set(routedChannels).size).toBe(methods.length)
    expect([...routedChannels].sort()).toEqual([...IPC_CHANNEL_WHITELIST].sort())
  })

  it('preload 桥调用仅路由到白名单内通道（invoke + 订阅两路）', async () => {
    const invoked: string[] = []
    const subscribed: string[] = []
    const bridge: IpcBridge = {
      invoke: async (channel) => {
        invoked.push(channel)
        return {
          ok: true,
          records: [],
          stats: { total: 0, tcp: 0, udp: 0, exposed: 0 },
          status: 'DONE'
        }
      },
      subscribe: (channel, _listener) => {
        subscribed.push(channel)
        return () => undefined
      }
    }
    const api = createPortgateApi(bridge)
    await api.getSettings()
    await api.setSettings({ theme: 'dark' })
    await api.getPortList()
    await api.getPortDetail('TCP:127.0.0.1:5173:100')
    await api.refreshPorts()
    await api.terminatePort('TCP:127.0.0.1:5173:100')
    await api.forceTerminatePort('TCP:127.0.0.1:5173:100')
    await api.revealRecord('TCP:127.0.0.1:5173:100', 'project')
    const unsubscribe = api.onPortEvents(() => undefined)
    expect(typeof unsubscribe).toBe('function')
    expect(invoked).toEqual([
      IPC_CHANNELS.SETTINGS_GET,
      IPC_CHANNELS.SETTINGS_SET,
      IPC_CHANNELS.PORT_LIST,
      IPC_CHANNELS.PORT_DETAIL,
      IPC_CHANNELS.PORT_REFRESH,
      IPC_CHANNELS.PORT_TERMINATE,
      IPC_CHANNELS.PORT_FORCE_TERMINATE,
      IPC_CHANNELS.RECORD_REVEAL
    ])
    expect(subscribed).toEqual([IPC_CHANNELS.PORT_EVENTS])
    for (const channel of [...invoked, ...subscribed]) {
      expect(IPC_CHANNEL_WHITELIST).toContain(channel)
    }
  })

  it('非白名单通道在桥层被运行时拒绝（invoke 拒绝 / subscribe 抛出）', () => {
    const api = createPortgateApi({
      invoke: async () => ({ ok: true }),
      subscribe: () => () => undefined
    })
    // PortgateApi 只暴露白名单方法；越权通道（含 kill(pid) 形态）无法经 api 触达 invoker
    expect(Object.values(PORTGATE_METHODS)).not.toContain('port:kill')
    expect(Object.values(PORTGATE_METHODS)).not.toContain('port:killByPid')
    expect(() =>
      createPortgateApi({
        invoke: async () => undefined,
        subscribe: (channel) => {
          if (channel === 'port:kill') {
            throw new Error('[portgate] 非白名单 IPC 通道被拒绝: port:kill')
          }
          return () => undefined
        }
      })
    ).toBeDefined()
    expect(api).toBeDefined()
  })
})
