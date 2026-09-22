/**
 * 统一搜索引擎（需求 §4 / 方案 §5.12，AC-01/03）：
 * - 分词：trim().split(/\s+/) 小写化；空查询 → 全部记录（调用方已按端口升序）；
 * - AND 语义：每个关键词至少命中任一字段（可跨字段分布），记录才保留；
 * - 关键词得分 = 其所有命中字段分值的最大值；记录总分 = 各关键词得分之和；
 * - 档位：100（Port/PID 精确）> 80/60（三名称精确/包含）> 30（命令/路径/可执行/CWD/容器包含）
 *   > 10（默认档，m-04：仅参与 AND 命中与高亮）；
 * - 输出：{ record, score, highlights }（每字段按关键词定位全部大小写不敏感区间）；
 * - 排序：score desc，同分 port asc，recordId 兜底；当前/历史共用同一套逻辑（R-02 基础）。
 * 纯函数，全分支单测。
 */
import type { HighlightRange, PortRecord } from '../../../shared/types'
import { computeKeywordRanges, mergeKeywordRanges } from './highlight'
import { SEARCH_FIELDS, SEARCH_WEIGHTS } from './fields'
import type { SearchFieldDefinition } from './fields'

export interface SearchMatch {
  record: PortRecord
  score: number
  highlights: Record<string, HighlightRange[]>
}

/** 查询分词（大小写不敏感） */
export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((keyword) => keyword.toLowerCase())
    .filter((keyword) => keyword.length > 0)
}

interface FieldHit {
  score: number
  ranges: HighlightRange[]
}

function matchField(
  field: SearchFieldDefinition,
  value: string,
  lowerKeyword: string
): FieldHit | null {
  const lowerValue = value.toLowerCase()
  switch (field.mode) {
    case 'numberExact': {
      if (lowerValue === lowerKeyword) {
        return {
          score: SEARCH_WEIGHTS.NUMBER_EXACT,
          ranges: computeKeywordRanges(lowerValue, lowerKeyword)
        }
      }
      return null
    }
    case 'nameExactOrContains': {
      if (lowerValue === lowerKeyword) {
        return {
          score: SEARCH_WEIGHTS.NAME_EXACT,
          ranges: computeKeywordRanges(lowerValue, lowerKeyword)
        }
      }
      const ranges = computeKeywordRanges(lowerValue, lowerKeyword)
      return ranges.length > 0
        ? { score: SEARCH_WEIGHTS.NAME_CONTAINS, ranges }
        : null
    }
    case 'contains': {
      const ranges = computeKeywordRanges(lowerValue, lowerKeyword)
      return ranges.length > 0 ? { score: SEARCH_WEIGHTS.TEXT_CONTAINS, ranges } : null
    }
    case 'default': {
      const ranges = computeKeywordRanges(lowerValue, lowerKeyword)
      return ranges.length > 0 ? { score: SEARCH_WEIGHTS.DEFAULT, ranges } : null
    }
  }
}

export function searchRecords(records: readonly PortRecord[], query: string): SearchMatch[] {
  const keywords = tokenizeQuery(query)
  if (keywords.length === 0) {
    return records.map((record) => ({ record, score: 0, highlights: {} }))
  }

  const matches: SearchMatch[] = []
  for (const record of records) {
    let totalScore = 0
    let allKeywordsMatched = true
    const highlights: Record<string, HighlightRange[]> = {}

    for (const lowerKeyword of keywords) {
      let keywordBestScore = 0
      for (const field of SEARCH_FIELDS) {
        const value = field.getValue(record)
        if (value === undefined || value.length === 0) {
          continue
        }
        const hit = matchField(field, value, lowerKeyword)
        if (hit === null) {
          continue
        }
        if (hit.score > keywordBestScore) {
          keywordBestScore = hit.score
        }
        const existing = highlights[field.id] ?? []
        highlights[field.id] = mergeKeywordRanges(existing, hit.ranges)
      }
      if (keywordBestScore === 0) {
        allKeywordsMatched = false
        break
      }
      totalScore += keywordBestScore
    }

    if (allKeywordsMatched) {
      matches.push({ record, score: totalScore, highlights })
    }
  }

  matches.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score
    }
    if (a.record.localPort !== b.record.localPort) {
      return a.record.localPort - b.record.localPort
    }
    return a.record.recordId.localeCompare(b.record.recordId)
  })
  return matches
}
