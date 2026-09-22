/**
 * Linux 平台适配器（R-01：V1 预留 stub——产物可产出、功能降级；
 * 阶段 6 接入降级提示横幅，V1.2 才做完整实现，届时先修订方案）。
 */
import type { PlatformAdapter, RawPort, RawProcess } from '../types'
import { AdapterError } from '../types'

export class LinuxAdapter implements PlatformAdapter {
  async scanPorts(): Promise<RawPort[]> {
    return []
  }

  async getProcessTable(): Promise<RawProcess[]> {
    return []
  }

  async getWorkingDirectories(_pids: number[]): Promise<Map<number, string>> {
    return new Map()
  }

  async getProcess(_pid: number): Promise<RawProcess | null> {
    return null
  }

  async getProcessTree(_pid: number): Promise<RawProcess[]> {
    return []
  }

  async terminateProcess(_pid: number, _force?: boolean): Promise<void> {
    throw new AdapterError('Linux 终止流程将在后续版本提供（R-01 功能降级）')
  }
}
