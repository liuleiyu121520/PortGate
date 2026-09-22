/**
 * macOS 平台适配器（方案 §5.3，v1.1 M-01/M-02 修订口径）：
 * - 监听扫描：`lsof -nP -iTCP -sTCP:LISTEN -iUDP -F0pcnPT` 单次调用覆盖 TCP LISTEN + UDP
 *   （P 字段产出协议，T 子字段产出状态）；
 * - 进程核心表与命令行表拆两次调用按 pid join（同列会导致 comm 被 MAXCOMLEN 截断为 16 字符）；
 * - 批量工作目录：仅对指定 PID 单次调用；
 * - 所有 spawn 注入 LC_ALL=C / LANG=C，10s 超时；非零退出（lsof 退出码 1 = 无匹配，属正常空结果）
 *   或超时抛 AdapterError，由 PortScanner 保留上一快照并推 SCAN_ERROR。
 * 终止能力（terminateProcess）仅由 KillPolicy（阶段 4）调用，renderer 不可达。
 */
import { spawn } from 'node:child_process'
import type { PlatformAdapter, RawPort, RawProcess } from '../types'
import { AdapterError } from '../types'
import { parseCwdOutput, parseLsofMachineOutput } from './lsofParser'
import {
  collectProcessAncestry,
  joinProcessTables,
  parseArgsTable,
  parseCoreTable
} from './psParser'

const SPAWN_TIMEOUT_MS = 10000

export class MacAdapter implements PlatformAdapter {
  async scanPorts(): Promise<RawPort[]> {
    const stdout = await this.runCommand('lsof', [
      '-nP',
      '-iTCP',
      '-sTCP:LISTEN',
      '-iUDP',
      '-F0pcnPT'
    ])
    return parseLsofMachineOutput(stdout).ports
  }

  async getProcessTable(): Promise<RawProcess[]> {
    const [coreOutput, argsOutput] = await Promise.all([
      this.runCommand('ps', ['-axo', 'pid=,ppid=,uid=,user=,lstart=,%cpu=,%mem=,comm=']),
      this.runCommand('ps', ['-axww', '-o', 'pid=,args='])
    ])
    const core = parseCoreTable(coreOutput)
    return joinProcessTables(core.processes, parseArgsTable(argsOutput))
  }

  async getWorkingDirectories(pids: number[]): Promise<Map<number, string>> {
    if (pids.length === 0) {
      return new Map()
    }
    const stdout = await this.runCommand('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')])
    return parseCwdOutput(stdout)
  }

  async getProcess(pid: number): Promise<RawProcess | null> {
    const table = await this.getProcessTable()
    return table.find((proc) => proc.pid === pid) ?? null
  }

  async getProcessTree(pid: number): Promise<RawProcess[]> {
    const table = await this.getProcessTable()
    return collectProcessAncestry(new Map(table.map((proc) => [proc.pid, proc])), pid)
  }

  async terminateProcess(pid: number, force = false): Promise<void> {
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
    } catch (error) {
      throw new AdapterError(
        `terminate pid=${pid} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /** 统一外部命令执行：locale 钉 C、超时保护；lsof 退出码 1 视为无匹配（空结果） */
  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
      })
      let stdout = ''
      let settled = false
      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        child.kill('SIGKILL')
        reject(new AdapterError(`${command} timed out after ${SPAWN_TIMEOUT_MS}ms`))
      }, SPAWN_TIMEOUT_MS)
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.on('error', (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(new AdapterError(`${command} failed to start: ${error.message}`))
      })
      child.on('close', (code: number | null) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        const emptyResult = code === 1 && command === 'lsof'
        if (code === 0 || emptyResult) {
          resolve(stdout)
        } else {
          reject(new AdapterError(`${command} exited with code ${code ?? 'unknown'}`))
        }
      })
    })
  }
}
