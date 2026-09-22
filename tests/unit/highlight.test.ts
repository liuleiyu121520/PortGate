/**
 * 命中区间纯函数测试（方案 §5.12 highlight.ts，AC-02 底层）：
 * 大小写不敏感全部区间、跨词边界不误伤、多关键词区间合并去重、空关键词/无命中。
 */
import { describe, expect, it } from 'vitest'
import { computeKeywordRanges, mergeKeywordRanges } from '../../src/main/core/search/highlight'

describe('computeKeywordRanges', () => {
  it('大小写不敏感定位全部出现区间', () => {
    expect(computeKeywordRanges('node server && node client', 'node')).toEqual([[0, 4], [15, 19]])
    // 函数契约：lowerValue 为已小写文本（SearchEngine 内先 toLowerCase 再调用）
    expect(computeKeywordRanges('node /node', 'node')).toEqual([[0, 4], [6, 10]])
  })

  it('ci-buddy 场景：不同字段各自定位（需求 §4.4）', () => {
    expect(computeKeywordRanges('ci-buddy', 'buddy')).toEqual([[3, 8]])
    expect(computeKeywordRanges('/users/x/ci-buddy/app', 'buddy')).toEqual([[12, 17]])
  })

  it('无命中返回空数组；空关键词返回空数组', () => {
    expect(computeKeywordRanges('node', 'zzz')).toEqual([])
    expect(computeKeywordRanges('node', '')).toEqual([])
  })

  it('重叠出现（自重叠关键词）逐位推进不遗漏', () => {
    expect(computeKeywordRanges('aaa', 'aa')).toEqual([[0, 2], [1, 3]])
  })
})

describe('mergeKeywordRanges', () => {
  it('追加区间并按起点+区间去重', () => {
    expect(mergeKeywordRanges([[0, 4]], [[0, 4]])).toEqual([[0, 4]])
    expect(mergeKeywordRanges([[0, 4]], [[15, 19]])).toEqual([[0, 4], [15, 19]])
  })

  it('保留重叠区间原样（并集交给 HighlightText 渲染侧）', () => {
    expect(mergeKeywordRanges([[0, 2]], [[1, 4]])).toEqual([[0, 2], [1, 4]])
  })
})
