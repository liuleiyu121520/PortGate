/**
 * 进程解析器（方案 §5.6）：持有两条进程命令 join 后的全量进程表（每轮随扫描刷新），
 * 提供 get / getTree（沿 PPID 上溯，深度上限 32，ppid≤1 止）与工作目录缓存
 * （仅对「当前监听记录涉及且未缓存」的 PID 交由适配器批量补取；pid 消失即清缓存）。
 */
import type { RawProcess } from '../../platform/types'
import { collectProcessAncestry } from '../../platform/mac/psParser'

export class ProcessResolver {
  private table = new Map<number, RawProcess>()
  private cwdCache = new Map<number, string>()

  /** 每轮扫描用最新全量表替换；不在新表中的 pid 一并清除工作目录缓存 */
  refresh(table: readonly RawProcess[]): void {
    this.table = new Map(table.map((proc) => [proc.pid, proc]))
    for (const pid of [...this.cwdCache.keys()]) {
      if (!this.table.has(pid)) {
        this.cwdCache.delete(pid)
      }
    }
  }

  get(pid: number): RawProcess | undefined {
    return this.table.get(pid)
  }

  getTree(pid: number, maxDepth = 32): RawProcess[] {
    return collectProcessAncestry(this.table, pid, maxDepth)
  }

  getCwd(pid: number): string | undefined {
    return this.cwdCache.get(pid)
  }

  setCwd(pid: number, cwd: string): void {
    this.cwdCache.set(pid, cwd)
  }

  /** 入参 pid 集合中尚未缓存工作目录者（调用方据此触发一次批量补取） */
  missingCwdPids(pids: readonly number[]): number[] {
    return pids.filter((pid) => !this.cwdCache.has(pid))
  }
}
