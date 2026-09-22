/**
 * 进程表解析器测试（方案 §5.3 / M-02，fixture 驱动）：
 * 位置锚定切分、单数日期空格填充 lstart、含空格路径、单空格列界、
 * 两表按 pid join（args 缺失 commandLine 为空）、16 字符截断回归证据。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  joinProcessTables,
  parseArgsTable,
  parseCoreTable,
  parseLstartToEpoch
} from '../../src/main/platform/mac/psParser'

function loadFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf-8')
}

const core = parseCoreTable(loadFixture('ps-core.txt'))
const joined = joinProcessTables(core.processes, parseArgsTable(loadFixture('ps-args.txt')))

describe('进程核心表解析（ps-core.txt / M-02）', () => {
  it('位置锚定：pid/ppid/uid/user/%cpu/%mem 正确落位', () => {
    const node = joined.find((p) => p.pid === 81234)
    expect(node).toMatchObject({
      ppid: 4512,
      uid: 501,
      user: 'leiyu',
      cpuPercent: 12.3,
      memPercent: 1.2,
      executablePath: '/Users/leiyu/code/github/PortGate/node'
    })
  })

  it('单数日期空格填充 lstart（POSIX %e）解析为正确 epoch', () => {
    const logd = joined.find((p) => p.pid === 33066)
    const expected = new Date(2026, 8, 2, 9, 15, 3, 0).getTime()
    expect(logd?.startedAt).toBe(expected)
  })

  it('lstart 固定月份映射（Jan=0）与时间字段', () => {
    const syslogd = joined.find((p) => p.pid === 50099)
    const expected = new Date(2026, 0, 2, 3, 4, 5, 0).getTime()
    expect(syslogd?.startedAt).toBe(expected)
  })

  it('含空格路径整段保留（列尾整段 = executablePath）', () => {
    const app = joined.find((p) => p.pid === 40012)
    expect(app?.executablePath).toBe('/Applications/My App.app/Contents/MacOS/My App')
    expect(app?.user).toBe('leiyu')
  })

  it('下划线服务账户 user 正确读取', () => {
    const logd = joined.find((p) => p.pid === 33066)
    expect(logd?.user).toBe('_windowserver')
    expect(logd?.uid).toBe(205)
  })

  it('命令行表 join：完整命令行保留内部空格（-ww 防截断）', () => {
    const node = joined.find((p) => p.pid === 81234)
    expect(node?.commandLine).toBe(
      'node /Users/leiyu/code/github/PortGate/scripts/dev-server.js --port 3000'
    )
  })

  it('join：命令行表缺失的 pid 其 commandLine 为空串（核心表为基准）', () => {
    const orphan = joined.find((p) => p.pid === 50099)
    expect(orphan?.commandLine).toBe('')
  })

  it('命令行表中多余 pid 不进入结果（核心表为基准）', () => {
    const argsOnly = parseArgsTable('  99999 extra --process\n')
    expect(argsOnly.has(99999)).toBe(true)
    expect(joined.find((p) => p.pid === 99999)).toBeUndefined()
  })
})

describe('lstart 解析单元（方案 §2.3-4：macOS 无 etimes，仅能解析 lstart）', () => {
  it('五段 lstart → 本地时区 epoch ms', () => {
    const epoch = parseLstartToEpoch(['Mon', 'Sep', '21', '14:08:26', '2026'])
    expect(epoch).toBe(new Date(2026, 8, 21, 14, 8, 26, 0).getTime())
  })

  it('非法月份返回 0（防御）', () => {
    expect(parseLstartToEpoch(['Mon', 'Xyz', '21', '14:08:26', '2026'])).toBe(0)
  })
})

describe('16 字符截断回归证据（ps-combined-truncation.txt / M-02）', () => {
  it('comm 与 args 同列时路径被截断为 16 字符（MAXCOMLEN）——证明必须拆两次调用', () => {
    const truncated = parseCoreTable(loadFixture('ps-combined-truncation.txt'))
    expect(truncated.processes).toHaveLength(1)
    const proc = truncated.processes[0]
    // 真实进程为 /usr/libexec/logd；同列截断后仅剩 /usr/libexec/log（恰 16 字符）
    expect(proc.executablePath).toBe('/usr/libexec/log')
    expect(proc.executablePath).toHaveLength(16)
  })
})
