/**
 * SearchEngine 测试（需求 §4 / 方案 §5.12，AC-01/03 + v1.2 m-04）：
 * 多关键词 AND、跨字段命中、四档权重排序（3000 用例）、默认档字段命中（计 10 分 + 高亮）、
 * 大小写不敏感、多命中区间、空查询、负向排除、同分端口升序；
 * fields.ts 覆盖需求 §4.2 全部 18 字段（无遗漏、无多余）架构断言。
 */
import { describe, expect, it } from 'vitest'
import type { PortRecord } from '../../src/shared/types'
import { searchRecords, tokenizeQuery } from '../../src/main/core/search/SearchEngine'
import { SEARCH_FIELDS, SEARCH_WEIGHTS } from '../../src/main/core/search/fields'

function mkRecord(overrides: Partial<PortRecord> & { localPort: number; pid: number }): PortRecord {
  const { localPort, pid, ...rest } = overrides
  return {
    recordId: `TCP:127.0.0.1:${localPort}:${pid}`,
    protocol: 'TCP',
    localAddress: '127.0.0.1',
    process: { pid, name: 'proc' },
    timing: { firstSeen: 0, lastSeen: 0 },
    security: { level: 'UNKNOWN' },
    pid,
    localPort,
    ...rest
  }
}
const EXPECTED_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['port', 'Port'],
  ['protocol', 'Protocol'],
  ['state', 'State'],
  ['localAddress', 'Local Address'],
  ['remoteAddress', 'Remote Address'],
  ['pid', 'PID'],
  ['ppid', 'PPID'],
  ['processName', 'Process Name'],
  ['executablePath', 'Executable Path'],
  ['commandLine', 'Command Line'],
  ['user', 'User'],
  ['applicationName', 'Application Name'],
  ['projectName', 'Project Name'],
  ['projectPath', 'Project Path'],
  ['workingDirectory', 'Working Directory'],
  ['containerName', 'Container Name'],
  ['containerImage', 'Docker Image'],
  ['protectionLevel', 'Protection Level']
]

/** 基准记录集：A(3000/node/user=leiyu)、B(4000/java/command 含 3000)、C(5173/nodemon) */
const recordA = mkRecord({ localPort: 3000, pid: 100 })
recordA.process = { pid: 100, name: 'node', user: 'leiyu' }
const recordB = mkRecord({ localPort: 4000, pid: 200 })
recordB.process = { pid: 200, name: 'java', commandLine: 'java -jar server --port=3000' }
const recordC = mkRecord({ localPort: 5173, pid: 300 })
recordC.process = { pid: 300, name: 'nodemon' }
const BASE_RECORDS: PortRecord[] = [recordA, recordB, recordC]

describe('fields.ts 覆盖需求 §4.2 全集（m-04 架构断言）', () => {
  it('恰好 18 个字段，id 与字段名两两恒等（无遗漏、无多余）', () => {
    expect(SEARCH_FIELDS).toHaveLength(18)
    expect(SEARCH_FIELDS.map((field) => [field.id, field.label])).toEqual([...EXPECTED_FIELDS])
  })

  it('档位常量与方案 §5.12 一致（100/80/60/30/10）', () => {
    expect(SEARCH_WEIGHTS.NUMBER_EXACT).toBe(100)
    expect(SEARCH_WEIGHTS.NAME_EXACT).toBe(80)
    expect(SEARCH_WEIGHTS.NAME_CONTAINS).toBe(60)
    expect(SEARCH_WEIGHTS.TEXT_CONTAINS).toBe(30)
    expect(SEARCH_WEIGHTS.DEFAULT).toBe(10)
  })

  it('默认档字段恰为 7 个：Protocol/State/Local Address/Remote Address/PPID/User/Protection Level', () => {
    const defaultFields = SEARCH_FIELDS.filter((field) => field.mode === 'default')
    expect(defaultFields.map((field) => field.id).sort()).toEqual(
      ['protocol', 'state', 'localAddress', 'remoteAddress', 'ppid', 'user', 'protectionLevel'].sort()
    )
  })
})

describe('分词与空查询', () => {
  it('trim + 空白分词 + 小写化', () => {
    expect(tokenizeQuery('  Node 5173 BUDDY ')).toEqual(['node', '5173', 'buddy'])
  })

  it('空查询 → 全部记录（保持入参端口升序）、score 0、无高亮', () => {
    const matches = searchRecords(BASE_RECORDS, '   ')
    expect(matches).toHaveLength(3)
    expect(matches.map((match) => match.record.localPort)).toEqual([3000, 4000, 5173])
    expect(matches.every((match) => match.score === 0)).toBe(true)
  })
})

describe('AND 与跨字段命中（AC-01）', () => {
  it('每个关键词可命中不同字段，仍视为命中（processName=node AND localPort=5173）', () => {
    const matches = searchRecords(BASE_RECORDS, 'node 5173')
    expect(matches.map((match) => match.record.localPort)).toEqual([5173])
    const match = matches[0]
    expect(match.highlights['processName']).toEqual([[0, 4]])
    expect(match.highlights['port']).toEqual([[0, 4]])
  })

  it('任一关键词无命中 → 记录被排除（AND 负向）', () => {
    expect(searchRecords(BASE_RECORDS, 'node zzz-not-exist')).toHaveLength(0)
    expect(searchRecords(BASE_RECORDS, 'java 5173')).toHaveLength(0)
  })
})

describe('权重排序（AC-03）', () => {
  it("搜索 '3000'：Port 精确（100）排在 command 包含（30）前面", () => {
    const matches = searchRecords(BASE_RECORDS, '3000')
    expect(matches).toHaveLength(2)
    expect(matches[0].record.localPort).toBe(3000)
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.NUMBER_EXACT)
    expect(matches[1].record.localPort).toBe(4000)
    expect(matches[1].score).toBe(SEARCH_WEIGHTS.TEXT_CONTAINS)
    expect(matches[1].highlights['commandLine']).toEqual([[24, 28]])
  })

  it('三名称精确（80）排在包含（60）前面', () => {
    const matches = searchRecords(BASE_RECORDS, 'node')
    expect(matches[0].record.process.name).toBe('node')
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.NAME_EXACT)
    expect(matches[1].record.process.name).toBe('nodemon')
    expect(matches[1].score).toBe(SEARCH_WEIGHTS.NAME_CONTAINS)
  })

  it('PID 数字精确 = 100', () => {
    const matches = searchRecords(BASE_RECORDS, '200')
    expect(matches).toHaveLength(1)
    expect(matches[0].record.pid).toBe(200)
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.NUMBER_EXACT)
    expect(matches[0].highlights['pid']).toEqual([[0, 3]])
  })

  it('同分按端口升序兜底', () => {
    const d1 = mkRecord({ localPort: 6000, pid: 600 })
    d1.process = { pid: 600, name: 'worker', user: 'shared' }
    const d2 = mkRecord({ localPort: 5000, pid: 500 })
    d2.process = { pid: 500, name: 'worker2', user: 'shared' }
    const matches = searchRecords([d1, d2], 'shared')
    // User 为默认档：两条各得 10 分，同分端口升序
    expect(matches.map((match) => match.record.localPort)).toEqual([5000, 6000])
  })
})

describe('默认档字段命中（m-04：计 10 分，参与 AND 与高亮）', () => {
  it("搜索 User 字段（'leiyu'）命中默认档：score=10、记录保留、user 字段产出高亮区间", () => {
    const matches = searchRecords(BASE_RECORDS, 'leiyu')
    expect(matches).toHaveLength(1)
    expect(matches[0].record.localPort).toBe(3000)
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.DEFAULT)
    expect(matches[0].highlights['user']).toEqual([[0, 5]])
  })

  it('默认档 + 主档混合：各关键词得分相加（10 + 100）', () => {
    const matches = searchRecords(BASE_RECORDS, 'leiyu 3000')
    expect(matches).toHaveLength(1)
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.DEFAULT + SEARCH_WEIGHTS.NUMBER_EXACT)
  })
})

describe('大小写不敏感与多命中区间', () => {
  it("大小写不敏感：'NODE' 命中 'node'（精确档）", () => {
    const matches = searchRecords(BASE_RECORDS, 'NODE')
    expect(matches[0].record.process.name).toBe('node')
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.NAME_EXACT)
  })

  it('同一字段关键词多次出现 → 全部区间', () => {
    const record = mkRecord({ localPort: 7000, pid: 700 })
    record.process = {
      pid: 700,
      name: 'node',
      commandLine: 'node server.js && node client.js'
    }
    const matches = searchRecords([record], 'node')
    expect(matches[0].highlights['commandLine']).toEqual([[0, 4], [18, 22]])
  })

  it("数值字段精确匹配不认子串：搜 '300' 不命中 Port=3000，但命中 PID=300（精确 100）与 B 的 command 包含（30）", () => {
    const matches = searchRecords(BASE_RECORDS, '300')
    expect(matches.map((match) => match.record.localPort)).toEqual([5173, 4000])
    expect(matches[0].score).toBe(SEARCH_WEIGHTS.NUMBER_EXACT)
    expect(matches[0].highlights['pid']).toEqual([[0, 3]])
    expect(matches[1].score).toBe(SEARCH_WEIGHTS.TEXT_CONTAINS)
  })
})

describe('AC-01 原始示例：「5173 node buddy」三关键词（QA major-1 回归）', () => {
  // 组合记录 D：port=5173 + process=node + project=ci-buddy（projectPath 亦含 buddy，30 档不高于名称包含档）
  const recordD = mkRecord({ localPort: 5173, pid: 400 })
  recordD.process = { pid: 400, name: 'node' }
  recordD.project = { name: 'ci-buddy', path: '/jobs/ci-buddy' }
  // 对照组 E：port 与 process 均命中，但 project 不含 buddy（缺一关键词）
  const recordE = mkRecord({ localPort: 5173, pid: 500 })
  recordE.process = { pid: 500, name: 'node' }
  recordE.project = { name: 'admin-portal' }
  // 对照组 F：仅 project 含 buddy，缺 5173 与 node
  const recordF = mkRecord({ localPort: 5174, pid: 600 })
  recordF.process = { pid: 600, name: 'python' }
  recordF.project = { name: 'ci-buddy' }

  it('三关键词全命中：记录保留，score=三关键词各最高档之和（100+80+60），命中字段与高亮区间正确', () => {
    const matches = searchRecords([recordD, recordE, recordF], '5173 node buddy')
    expect(matches).toHaveLength(1)
    expect(matches[0].record).toBe(recordD)
    expect(matches[0].score).toBe(
      SEARCH_WEIGHTS.NUMBER_EXACT + SEARCH_WEIGHTS.NAME_EXACT + SEARCH_WEIGHTS.NAME_CONTAINS
    )
    // 每个关键词命中的字段与区间：5173→Port、node→Process Name（精确全串）、buddy→Project Name（包含）与 Project Path（包含）
    expect(matches[0].highlights['port']).toEqual([[0, 4]])
    expect(matches[0].highlights['processName']).toEqual([[0, 4]])
    expect(matches[0].highlights['projectName']).toEqual([[3, 8]])
    expect(matches[0].highlights['projectPath']).toEqual([[9, 14]])
  })

  it('对照组：缺任一关键词命中的记录被排除（E 缺 buddy / F 缺 5173 与 node）', () => {
    const matches = searchRecords([recordD, recordE, recordF], '5173 node buddy')
    const kept = matches.map((match) => match.record)
    expect(kept).not.toContain(recordE)
    expect(kept).not.toContain(recordF)
    // E 的排除确因缺 buddy：去掉该关键词后 E 保留
    const withoutBuddy = searchRecords([recordD, recordE], '5173 node')
    expect(withoutBuddy.map((match) => match.record)).toContain(recordE)
  })

  it('关键词顺序无关：buddy node 5173 与 5173 node buddy 结果恒等（记录/得分/高亮）', () => {
    const forward = searchRecords([recordD, recordE, recordF], '5173 node buddy')
    const reversed = searchRecords([recordD, recordE, recordF], 'buddy node 5173')
    expect(reversed.map((match) => match.record.recordId)).toEqual(
      forward.map((match) => match.record.recordId)
    )
    expect(reversed.map((match) => match.score)).toEqual(forward.map((match) => match.score))
    expect(reversed[0].highlights).toEqual(forward[0].highlights)
  })
})
