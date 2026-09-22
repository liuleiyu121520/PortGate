/**
 * 命中区间计算（方案 §5.12 / 需求 §4.4，AC-02）：纯函数。
 * 在字段值文本中按关键词（已小写）定位全部大小写不敏感出现区间 [start, end)（end 独占）。
 * 不同关键词在同一字段产生的区间允许重叠、由调用方原样合并输出；
 * 渲染侧统一由 HighlightText 组件做区间并集与分段（不在各列重复实现）。
 */
import type { HighlightRange } from '../../../shared/types'

/** 单关键词的全部出现区间（大小写不敏感） */
export function computeKeywordRanges(lowerValue: string, lowerKeyword: string): HighlightRange[] {
  const ranges: HighlightRange[] = []
  if (lowerKeyword.length === 0) {
    return ranges
  }
  let from = 0
  while (from <= lowerValue.length - lowerKeyword.length) {
    const index = lowerValue.indexOf(lowerKeyword, from)
    if (index < 0) {
      break
    }
    ranges.push([index, index + lowerKeyword.length])
    from = index + 1
  }
  return ranges
}

/** 多关键词区间合并（追加去重，不并集；渲染侧 HighlightText 负责并集分段） */
export function mergeKeywordRanges(
  base: readonly HighlightRange[],
  extra: readonly HighlightRange[]
): HighlightRange[] {
  const seen = new Set(base.map((range) => `${range[0]}:${range[1]}`))
  const merged: HighlightRange[] = [...base]
  for (const range of extra) {
    const key = `${range[0]}:${range[1]}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(range)
    }
  }
  return merged
}
