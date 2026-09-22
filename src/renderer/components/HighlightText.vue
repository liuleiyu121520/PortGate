<script setup lang="ts">
import { computed } from 'vue'
import type { HighlightRange } from '../../shared/types'

/**
 * 统一命中高亮组件（需求 §4.4 / 方案 §6，AC-02）：
 * 全应用唯一高亮实现——各列/详情 Drawer 一律经本组件渲染命中区间，
 * 禁止自行拼 <mark>（架构测试断言唯一性）。区间做并集与排序后分段渲染，
 * 保证关键词全覆盖且分段互不重叠。
 */
const props = withDefaults(
  defineProps<{
    text: string
    ranges?: HighlightRange[]
  }>(),
  {
    ranges: () => []
  }
)

interface Segment {
  text: string
  marked: boolean
}

function mergeRanges(ranges: readonly HighlightRange[]): HighlightRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: HighlightRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last !== undefined && range[0] <= last[1]) {
      // 相交或相邻：并集扩展
      if (range[1] > last[1]) {
        merged[merged.length - 1] = [last[0], range[1]]
      }
    } else {
      merged.push([range[0], range[1]])
    }
  }
  return merged
}

const segments = computed<Segment[]>(() => {
  const text = props.text
  const merged = mergeRanges(props.ranges)
  const result: Segment[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    if (start > cursor) {
      result.push({ text: text.slice(cursor, start), marked: false })
    }
    result.push({ text: text.slice(start, Math.min(end, text.length)), marked: true })
    cursor = Math.min(end, text.length)
  }
  if (cursor < text.length) {
    result.push({ text: text.slice(cursor), marked: false })
  }
  return result
})
</script>

<template>
  <span class="pg-highlight">
    <template
      v-for="(segment, index) in segments"
      :key="index"
    >
      <mark
        v-if="segment.marked"
        class="pg-highlight__mark"
      >{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<style lang="less" scoped>
.pg-highlight__mark {
  padding: 0;
  color: var(--pg-accent);
  background-color: color-mix(in srgb, var(--pg-accent) 18%, transparent);
  border-radius: 2px;
  font-weight: 600;
}
</style>
