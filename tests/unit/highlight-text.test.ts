/**
 * HighlightText 组件测试（需求 §4.4 / 方案 §6 与 §8.1，AC-02）：
 * @vue/test-utils + happy-dom。分段计算正确、关键词全覆盖、分段互不重叠（区间并集）、
 * 无区间时原样渲染、mark 为全应用唯一高亮载体。
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HighlightText from '../../src/renderer/components/HighlightText.vue'

function mountText(text: string, ranges: Array<[number, number]> = []) {
  return mount(HighlightText, {
    props: { text, ranges }
  })
}

describe('HighlightText（唯一高亮实现）', () => {
  it('无区间时原样渲染且不产生 mark', () => {
    const wrapper = mountText('node 5173')
    expect(wrapper.text()).toBe('node 5173')
    expect(wrapper.findAll('mark')).toHaveLength(0)
  })

  it('单区间：命中段渲染为 mark', () => {
    const wrapper = mountText('node 5173', [[5, 9]])
    const marks = wrapper.findAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].text()).toBe('5173')
    expect(wrapper.text()).toBe('node 5173')
  })

  it('多区间：全部关键词覆盖（node node → 2 个 mark）', () => {
    const wrapper = mountText('node node', [[0, 4], [5, 9]])
    const marks = wrapper.findAll('mark')
    expect(marks).toHaveLength(2)
    expect(marks.map((mark) => mark.text())).toEqual(['node', 'node'])
    expect(wrapper.text()).toBe('node node')
  })

  it('相邻区间合并为一段（不产生重叠/零宽分段）', () => {
    const wrapper = mountText('node', [[0, 2], [2, 4]])
    const marks = wrapper.findAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].text()).toBe('node')
  })

  it('重叠区间取并集（不同关键词部分重叠）', () => {
    const wrapper = mountText('nodemon', [[0, 3], [2, 7]])
    const marks = wrapper.findAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0].text()).toBe('nodemon')
    expect(wrapper.text()).toBe('nodemon')
  })

  it('乱序输入区间仍正确分段（内部排序）', () => {
    const wrapper = mountText('ci-buddy /ci-buddy', [[10, 12], [0, 2]])
    const marks = wrapper.findAll('mark')
    expect(marks.map((mark) => mark.text())).toEqual(['ci', 'ci'])
    expect(wrapper.text()).toBe('ci-buddy /ci-buddy')
  })

  it('区间越界被钳制不越界（防御）', () => {
    const wrapper = mountText('node', [[3, 99]])
    expect(wrapper.findAll('mark')).toHaveLength(1)
    expect(wrapper.text()).toBe('node')
  })
})
