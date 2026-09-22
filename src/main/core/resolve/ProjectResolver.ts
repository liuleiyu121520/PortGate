/**
 * ProjectResolver（方案 §5.8 / 需求 §9.2，AC-06）：
 * 输入 cwd，向上逐级查找 marker（优先级见 markers.ts）；上溯边界：越过 $HOME 即停
 * （避免把 /Users 下层误判为项目）；名称按就近 marker 受限正则提取，失败回退目录名；
 * 结果按 (pid, cwd) 缓存，cwd 变化即失效。无 marker → undefined（字段位保留）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { ProjectInfo } from '../../../shared/types'
import { MARKER_READ_LIMIT_BYTES, PROJECT_MARKERS, buildProjectInfo } from './markers'

export class ProjectResolver {
  private readonly homeDir: string
  private readonly cache = new Map<string, ProjectInfo | undefined>()

  constructor(homeDir: string = homedir()) {
    this.homeDir = homeDir
  }

  resolve(pid: number, cwd: string): ProjectInfo | undefined {
    const cacheKey = `${pid}:${cwd}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    const info = this.searchFrom(cwd)
    this.cache.set(cacheKey, info)
    return info
  }

  /** cwd 变化即失效：旧 cwd 的缓存由调用方在感知到变化时清条目（pid 粒度失效见 invalidatePid） */
  invalidate(pid: number, cwd?: string): void {
    if (cwd === undefined) {
      for (const key of [...this.cache.keys()]) {
        if (key.startsWith(`${pid}:`)) {
          this.cache.delete(key)
        }
      }
      return
    }
    this.cache.delete(`${pid}:${cwd}`)
  }

  private searchFrom(startDir: string): ProjectInfo | undefined {
    let current = startDir
    // 上溯边界：越过 $HOME 即停（仅搜索 $HOME 子树，含 $HOME 本身）
    while (current === this.homeDir || current.startsWith(`${this.homeDir}/`)) {
      const hit = this.matchMarkerIn(current)
      if (hit !== undefined) {
        return hit
      }
      const parent = dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
    return undefined
  }

  private matchMarkerIn(dir: string): ProjectInfo | undefined {
    for (const definition of PROJECT_MARKERS) {
      const markerPath = join(dir, definition.marker)
      if (!existsSync(markerPath)) {
        continue
      }
      let extracted: string | undefined
      if (definition.extractName !== undefined) {
        try {
          const raw = readFileSync(markerPath)
          // 受限读取（上限截断，避免超大文件）
          const content =
            raw.length > MARKER_READ_LIMIT_BYTES
              ? raw.subarray(0, MARKER_READ_LIMIT_BYTES).toString('utf-8')
              : raw.toString('utf-8')
          extracted = definition.extractName(content)
        } catch {
          extracted = undefined
        }
      }
      return buildProjectInfo(definition, dir, extracted)
    }
    return undefined
  }
}
