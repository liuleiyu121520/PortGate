/**
 * 平台适配器工厂（方案 §5.2 / 需求 §13）：
 * 全工程唯一 process.platform 合法位置（AC-16 平台分支唯一合法点，
 * ESLint no-restricted-properties 与架构测试双重守护，其他位置一律违规）。
 */
import type { PlatformAdapter } from './types'
import { AdapterError } from './types'
import { LinuxAdapter } from './linux/LinuxAdapter'
import { MacAdapter } from './mac/MacAdapter'
import { WindowsAdapter } from './windows/WindowsAdapter'

export function createAdapter(platform: NodeJS.Platform = process.platform): PlatformAdapter {
  switch (platform) {
    case 'darwin':
      return new MacAdapter()
    case 'win32':
      return new WindowsAdapter()
    case 'linux':
      return new LinuxAdapter()
    default:
      throw new AdapterError(`unsupported platform: ${platform}`)
  }
}
