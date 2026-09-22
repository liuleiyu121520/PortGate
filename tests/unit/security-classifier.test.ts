/**
 * SecurityClassifier 测试（方案 §5.10 / 需求 §16，AC-08/10 底座）：
 * 七条规则全矩阵 + 「不只看进程名」反例（同名 node 在系统路径与用户域分级不同）。
 */
import { describe, expect, it } from 'vitest'
import { SecurityClassifier } from '../../src/main/core/security/SecurityClassifier'

const classifier = new SecurityClassifier(501)

function classify(input: {
  pid: number
  uid?: number
  user?: string
  executablePath?: string
}): string {
  return classifier.classify(input)
}

describe('七条规则矩阵（方案 §5.10）', () => {
  it('规则 1：pid <= 1 → SYSTEM_CRITICAL', () => {
    expect(classify({ pid: 1, uid: 501, user: 'leiyu', executablePath: '/sbin/launchd' })).toBe('SYSTEM_CRITICAL')
    expect(classify({ pid: 0, uid: 501, user: 'leiyu' })).toBe('SYSTEM_CRITICAL')
  })

  it('规则 2：/System/ 或 /usr/libexec/ 前缀 → SYSTEM_CRITICAL', () => {
    expect(classify({ pid: 100, uid: 0, user: 'root', executablePath: '/System/Library/CoreServices/launchd' })).toBe('SYSTEM_CRITICAL')
    expect(classify({ pid: 101, uid: 205, user: '_logd', executablePath: '/usr/libexec/logd' })).toBe('SYSTEM_CRITICAL')
  })

  it('规则 3：/usr/sbin/ /usr/bin/ /sbin/ /private/var/db/ 前缀 → SYSTEM', () => {
    expect(classify({ pid: 102, uid: 0, user: 'root', executablePath: '/usr/sbin/syslogd' })).toBe('SYSTEM')
    expect(classify({ pid: 103, uid: 501, user: 'leiyu', executablePath: '/usr/bin/python3' })).toBe('SYSTEM')
    expect(classify({ pid: 104, uid: 501, user: 'leiyu', executablePath: '/sbin/ping' })).toBe('SYSTEM')
    expect(classify({ pid: 105, uid: 501, user: 'leiyu', executablePath: '/private/var/db/x/tool' })).toBe('SYSTEM')
  })

  it('规则 4：服务账户（user 以 _ 开头）→ SYSTEM', () => {
    expect(classify({ pid: 106, uid: 271, user: '_mdnsresponder', executablePath: '/custom/mDNSResponder' })).toBe('SYSTEM')
  })

  it('规则 5：uid=0 且不在用户域 → SYSTEM；uid=0 但在用户域继续后续规则（不满足 6 因 uid 不同 → UNKNOWN）', () => {
    expect(classify({ pid: 107, uid: 0, user: 'root', executablePath: '/opt/srv/daemon' })).toBe('SYSTEM')
    expect(classify({ pid: 108, uid: 0, user: 'root', executablePath: '/Applications/MyApp.app/Contents/MacOS/MyApp' })).toBe('UNKNOWN')
  })

  it('规则 6：用户域 + 当前 uid → USER（四类用户域前缀）', () => {
    expect(classify({ pid: 109, uid: 501, user: 'leiyu', executablePath: '/Users/leiyu/work/srv' })).toBe('USER')
    expect(classify({ pid: 110, uid: 501, user: 'leiyu', executablePath: '/Applications/Safari.app/Contents/MacOS/Safari' })).toBe('USER')
    expect(classify({ pid: 111, uid: 501, user: 'leiyu', executablePath: '/opt/homebrew/bin/node' })).toBe('USER')
    expect(classify({ pid: 112, uid: 501, user: 'leiyu', executablePath: '/usr/local/bin/server' })).toBe('USER')
  })

  it('规则 7：其余（无路径/外置卷/身份缺失）→ UNKNOWN', () => {
    expect(classify({ pid: 113 })).toBe('UNKNOWN')
    expect(classify({ pid: 114, uid: 501, user: 'leiyu', executablePath: '/Volumes/External/tool' })).toBe('UNKNOWN')
    expect(classify({ pid: 115, uid: 502, user: 'other', executablePath: '/Users/leiyu/work/srv' })).toBe('UNKNOWN')
  })
})

describe('「不只看进程名」反例（需求 §16 / 方案 §8.1）', () => {
  it('同名 node：系统路径下 SYSTEM，用户域下 USER，外置卷下 UNKNOWN', () => {
    expect(classify({ pid: 200, uid: 501, user: 'leiyu', executablePath: '/usr/bin/node' })).toBe('SYSTEM')
    expect(classify({ pid: 201, uid: 501, user: 'leiyu', executablePath: '/opt/homebrew/bin/node' })).toBe('USER')
    expect(classify({ pid: 202, uid: 501, user: 'leiyu', executablePath: '/Volumes/data/node' })).toBe('UNKNOWN')
  })

  it('进程名伪装不影响判定：名字叫 launchd 但在用户域且 uid 匹配 → USER', () => {
    expect(classify({ pid: 203, uid: 501, user: 'leiyu', executablePath: '/Users/evil/launchd' })).toBe('USER')
  })

  it('路径前缀边界完整性：/usr/local/ 用户域不与 /usr/sbin/ 系统混淆；非同前缀（local-、bin-）不误判 → UNKNOWN', () => {
    expect(classify({ pid: 204, uid: 501, user: 'leiyu', executablePath: '/usr/local/bin/x' })).toBe('USER')
    expect(classify({ pid: 205, uid: 501, user: 'leiyu', executablePath: '/usr/local-malicious/x' })).toBe('UNKNOWN')
    expect(classify({ pid: 206, uid: 501, user: 'leiyu', executablePath: '/usr/bin-malicious/x' })).toBe('UNKNOWN')
  })
})
