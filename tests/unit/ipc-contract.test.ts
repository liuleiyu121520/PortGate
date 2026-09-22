/**
 * IPC 契约测试（方案 §4.2 / v1.2 m-05，阶段 1 建立、阶段 5 接入 port:history 时复验）：
 * - ipc-contract.ts 为每个 channel 注释唯一职责（静态断言源码注释存在）；
 * - 各 channel 职责互不重叠（唯一职责描述两两不同）；
 * - 入参字段均有消费方（register.ts 源码引用）；
 * - settings:set 契约校验（scanInterval 仅接受 1000/2000/5000）与 CSP 定稿记录一致性。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  IPC_CHANNEL_CONTRACTS,
  IPC_CHANNEL_WHITELIST,
  normalizeSettingsUpdate
} from '../../src/shared/ipc-contract'
import { CSP_DEV, CSP_PROD, SCAN_INTERVAL_OPTIONS, THEME_NAMES } from '../../src/shared/constants'

// vitest 以项目根为工作目录运行（npm test 从 package.json 所在目录启动）
const PROJECT_ROOT = process.cwd()

const CONTRACT_SOURCE = readFileSync(resolve(PROJECT_ROOT, 'src/shared/ipc-contract.ts'), 'utf-8')
const REGISTER_SOURCE = readFileSync(resolve(PROJECT_ROOT, 'src/main/ipc/register.ts'), 'utf-8')

describe('IPC 契约：唯一职责注释与互不重叠（方案 §4.2 / m-05）', () => {
  it('每个白名单 channel 在 ipc-contract.ts 中都有「唯一职责」注释', () => {
    const responsibilityByChannel = new Map<string, string>()
    const pattern = /\/\*\*\s*唯一职责：(.+?)\s*\*\/\s*\n\s*[A-Z0-9_]+\s*:\s*'([^']+)'/g
    for (const match of CONTRACT_SOURCE.matchAll(pattern)) {
      responsibilityByChannel.set(match[2], match[1].trim())
    }
    for (const channel of IPC_CHANNEL_WHITELIST) {
      const responsibility = responsibilityByChannel.get(channel)
      expect(responsibility, `channel ${channel} 缺少「唯一职责」注释`).toBeTruthy()
    }
    expect(responsibilityByChannel.size).toBe(IPC_CHANNEL_WHITELIST.length)
  })

  it('契约元数据与白名单通道一一对应', () => {
    expect(IPC_CHANNEL_CONTRACTS.map((c) => c.channel).sort()).toEqual(
      [...IPC_CHANNEL_WHITELIST].sort()
    )
  })

  it('各 channel 职责互不重叠（唯一职责描述两两不同）', () => {
    const responsibilities = IPC_CHANNEL_CONTRACTS.map((c) => c.responsibility)
    expect(responsibilities.length).toBeGreaterThanOrEqual(1)
    for (const responsibility of responsibilities) {
      expect(responsibility.length).toBeGreaterThan(0)
    }
    expect(new Set(responsibilities).size).toBe(responsibilities.length)
  })

  it('入参字段均有消费方（register.ts 源码引用每个 paramField）', () => {
    for (const contract of IPC_CHANNEL_CONTRACTS) {
      for (const field of contract.paramFields) {
        expect(
          REGISTER_SOURCE.includes(field),
          `channel ${contract.channel} 的入参字段 ${field} 未被 register.ts 消费`
        ).toBe(true)
      }
    }
  })
})

describe('settings:set 契约校验（方案 §4.2：scanInterval 仅接受 1000/2000/5000）', () => {
  it('接受合法扫描周期与主题', () => {
    expect(normalizeSettingsUpdate({ scanInterval: 1000 })).toEqual({
      ok: true,
      value: { scanInterval: 1000 }
    })
    expect(normalizeSettingsUpdate({ theme: 'dark' })).toEqual({
      ok: true,
      value: { theme: 'dark' }
    })
    expect(normalizeSettingsUpdate({ scanInterval: 5000, theme: 'light' })).toEqual({
      ok: true,
      value: { scanInterval: 5000, theme: 'light' }
    })
  })

  it('拒绝越权扫描周期 / 非法主题 / 未知字段 / 空更新 / 非对象载荷', () => {
    expect(normalizeSettingsUpdate({ scanInterval: 3000 }).ok).toBe(false)
    expect(normalizeSettingsUpdate({ scanInterval: -1 }).ok).toBe(false)
    expect(normalizeSettingsUpdate({ theme: 'blue' }).ok).toBe(false)
    expect(normalizeSettingsUpdate({ evil: 1 }).ok).toBe(false)
    expect(normalizeSettingsUpdate({}).ok).toBe(false)
    expect(normalizeSettingsUpdate(null).ok).toBe(false)
    expect(normalizeSettingsUpdate('settings:set').ok).toBe(false)
    expect(normalizeSettingsUpdate([2000]).ok).toBe(false)
  })

  it('常量与契约一致：扫描周期档位与主题枚举', () => {
    expect([...SCAN_INTERVAL_OPTIONS].sort((a, b) => a - b)).toEqual([1000, 2000, 5000])
    expect([...THEME_NAMES].sort()).toEqual(['dark', 'light'])
  })
})

describe('CSP 定稿记录（方案 §3.3 / m-06：完整指令集；dev 额外放开 connect-src ws:）', () => {
  it('prod CSP 为完整指令集且不含 ws: 放宽', () => {
    expect(CSP_PROD).toBe("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:")
    expect(CSP_PROD.includes('ws:')).toBe(false)
    expect(CSP_PROD).toContain("default-src 'self'")
    expect(CSP_PROD).toContain("style-src 'self' 'unsafe-inline'")
    expect(CSP_PROD).toContain("img-src 'self' data:")
  })

  it('dev CSP 在完整指令集之上仅追加 connect-src ws:', () => {
    expect(CSP_DEV.startsWith(CSP_PROD)).toBe(true)
    expect(CSP_DEV).toContain("connect-src 'self' ws:")
  })
})
