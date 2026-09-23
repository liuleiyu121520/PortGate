/**
 * 时长紧凑格式全分支断言（UI 重构方案 §8.3，#17）：
 * 秒位为零则省略——45s、60s→1m、150s→2m30s、3600s→1h、4980s→1h23m；
 * 1m0s / 1h0m 形态消失；负值/零防御。
 */
import { describe, expect, it } from 'vitest'
import { formatDuration } from '../../src/renderer/utils/format'

describe('formatDuration（秒位为零省略）', () => {
  it('秒级', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(999)).toBe('0s')
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(59_000)).toBe('59s')
  })

  it('分级（零秒省略）', () => {
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(61_000)).toBe('1m1s')
    expect(formatDuration(120_000)).toBe('2m')
    expect(formatDuration(150_000)).toBe('2m30s')
    expect(formatDuration(3_599_000)).toBe('59m59s')
  })

  it('时级（零分钟省略；分钟存在不带秒）', () => {
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(3_660_000)).toBe('1h1m')
    expect(formatDuration(4_980_000)).toBe('1h23m')
    expect(formatDuration(86_340_000)).toBe('23h59m')
  })

  it('负值防御（取 0）', () => {
    expect(formatDuration(-1000)).toBe('0s')
  })
})
