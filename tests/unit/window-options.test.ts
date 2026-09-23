/**
 * hiddenInset 窗口选项断言（UI 重构方案 §7.1/§7.4，UI-AC-21 自动化部分）：
 * TITLEBAR_MODE × platform 四组合穷举 + 默认参数形态 + R-UI-2 回退开关单点生效。
 */
import { describe, expect, it } from 'vitest'
import { getWindowOptions } from '../../src/main/platform/window'
import { TITLEBAR_MODE } from '../../src/shared/constants'

describe('getWindowOptions 四组合（§7.1/§7.4）', () => {
  it("inset × darwin → hiddenInset + 交通灯 (x:16, y:20)", () => {
    expect(getWindowOptions('inset', 'darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 20 }
    })
  })

  it('inset × win32 / linux → 空选项（系统标题栏，页眉去重复标题）', () => {
    expect(getWindowOptions('inset', 'win32')).toEqual({})
    expect(getWindowOptions('inset', 'linux')).toEqual({})
  })

  it("system × darwin → 空选项（R-UI-2 回退形态：恢复系统标题栏）", () => {
    expect(getWindowOptions('system', 'darwin')).toEqual({})
  })

  it('system × win32 → 空选项', () => {
    expect(getWindowOptions('system', 'win32')).toEqual({})
  })

  it('默认参数 = 共享常量 + 运行平台（本仓库 TITLEBAR_MODE 默认 inset）', () => {
    expect(TITLEBAR_MODE).toBe('inset')
    const options = getWindowOptions()
    const expected =
      process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 20 } }
        : {}
    expect(options).toEqual(expected)
  })
})
