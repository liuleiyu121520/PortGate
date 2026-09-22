/**
 * KillPolicy 状态机（方案 §5.11 / 需求 §15/§17，AC-08/09/11）：
 *
 * IDLE → VALIDATING
 * VALIDATING:
 *   s1 按 recordId 取当前快照（不存在 → DENIED:RECORD_GONE）
 *   s2 adapter.getProcess(pid) 重读（进程已死 → DONE:ALREADY_EXITED）
 *   s3 startTime 校验：重读 lstart epoch == 快照（不等 → DENIED:PID_REUSE）
 *   s4 executable 校验：路径一致（不等 → DENIED:PID_REUSE）
 *   s5 用重读数据重算 SecurityClassifier
 *      USER → EXECUTING；SYSTEM/SYSTEM_CRITICAL/UNKNOWN → DENIED:PROTECTED(level)
 * EXECUTING: SIGTERM（adapter.terminateProcess(pid, false)）；系统错误 → FAILED(err)
 * AWAITING_EXIT: 轮询 200ms，宽限 3s；退出 → DONE → 触发即时重扫；超时 → PENDING_FORCE
 * FORCE_EXECUTING（forceTerminate）: 再次完整 VALIDATING(s1~s5) → SIGKILL → DONE/DENIED/FAILED
 *
 * 安全红线（需求 §15）：只接受 recordId，不接受 PID；主进程全量校验后才可执行；
 * 每次终止操作（含拒绝）均输出审计日志。
 */
import type { PortRecord, TerminateResult } from '../../../shared/types'
import type { RawProcess } from '../../platform/types'
import type { SecurityClassifier, SecurityInput } from './SecurityClassifier'

/** 宽限与轮询常量（方案 §5.11：轮询 200ms，宽限 3s） */
export const GRACE_PERIOD_MS = 3000
export const POLL_INTERVAL_MS = 200

export interface KillClock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const realClock: KillClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
}

export interface KillPolicyDeps {
  /** 当前快照查询（s1） */
  findRecord: (recordId: string) => PortRecord | null
  /** 进程重读（s2/s3/s4 与退出确认；真实重读，不复用扫描缓存——防 PID 复用） */
  getProcess: (pid: number) => Promise<RawProcess | null>
  terminateProcess: (pid: number, force?: boolean) => Promise<void>
  classifier: SecurityClassifier
  clock?: KillClock
  /** DONE 后回调（触发即时重扫；force 区分 SIGKILL） */
  onExitConfirmed?: (recordId: string, force: boolean) => void
  /** 审计日志（默认 console.log，main 进程 stdout） */
  audit?: (line: string) => void
}

interface ValidationOk {
  kind: 'ok'
  pid: number
}

interface ValidationOutcome {
  kind: 'result'
  result: TerminateResult
}

type ValidationResult = ValidationOk | ValidationOutcome

export class KillPolicy {
  private readonly deps: KillPolicyDeps
  private readonly clock: KillClock

  constructor(deps: KillPolicyDeps) {
    this.deps = deps
    this.clock = deps.clock ?? realClock
  }

  /** 安全终止：SIGTERM → 3s 宽限 → DONE | PENDING_FORCE（Renderer 决定是否强制） */
  async terminate(recordId: string): Promise<TerminateResult> {
    this.audit(recordId, 'VALIDATING', 'start')
    const validation = await this.validate(recordId)
    if (validation.kind === 'result') {
      this.audit(recordId, 'VALIDATING', `rejected:${validation.result.denyReason ?? validation.result.detail ?? 'unknown'}`)
      return validation.result
    }
    const pid = validation.pid
    try {
      this.audit(recordId, 'EXECUTING', `SIGTERM pid=${pid}`)
      await this.deps.terminateProcess(pid, false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.audit(recordId, 'EXECUTING', `FAILED ${message}`)
      return { recordId, status: 'FAILED', detail: message }
    }
    // AWAITING_EXIT：轮询 200ms，宽限 3s
    const deadline = this.clock.now() + GRACE_PERIOD_MS
    while (this.clock.now() < deadline) {
      await this.clock.sleep(POLL_INTERVAL_MS)
      const alive = (await this.deps.getProcess(pid)) !== null
      if (!alive) {
        this.audit(recordId, 'AWAITING_EXIT', 'exited -> DONE')
        this.deps.onExitConfirmed?.(recordId, false)
        return { recordId, status: 'DONE' }
      }
    }
    this.audit(recordId, 'AWAITING_EXIT', 'grace timeout -> PENDING_FORCE')
    return { recordId, status: 'PENDING_FORCE' }
  }

  /** 强制终止（FORCE_EXECUTING）：再次完整 VALIDATING → SIGKILL → DONE/DENIED/FAILED */
  async forceTerminate(recordId: string): Promise<TerminateResult> {
    this.audit(recordId, 'FORCE_VALIDATING', 'start')
    const validation = await this.validate(recordId)
    if (validation.kind === 'result') {
      this.audit(recordId, 'FORCE_VALIDATING', `rejected:${validation.result.denyReason ?? validation.result.detail ?? 'unknown'}`)
      return validation.result
    }
    const pid = validation.pid
    try {
      this.audit(recordId, 'FORCE_EXECUTING', `SIGKILL pid=${pid}`)
      await this.deps.terminateProcess(pid, true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.audit(recordId, 'FORCE_EXECUTING', `FAILED ${message}`)
      return { recordId, status: 'FAILED', detail: message }
    }
    this.audit(recordId, 'FORCE_EXECUTING', 'signal delivered -> DONE')
    this.deps.onExitConfirmed?.(recordId, true)
    return { recordId, status: 'DONE' }
  }

  /** VALIDATING s1~s5：快照 → 重读 → startTime → executable → 重算保护级 */
  private async validate(recordId: string): Promise<ValidationResult> {
    // s1 当前快照
    const record = this.deps.findRecord(recordId)
    if (record === null) {
      return {
        kind: 'result',
        result: { recordId, status: 'DENIED', denyReason: 'RECORD_GONE' }
      }
    }
    // s2 重读进程（已死 → DONE:ALREADY_EXITED）
    const proc = await this.deps.getProcess(record.pid)
    if (proc === null) {
      return {
        kind: 'result',
        result: { recordId, status: 'DONE', detail: 'ALREADY_EXITED' }
      }
    }
    // s3 startTime 校验（PID 复用防线一）
    if (proc.startedAt !== record.process.startedAt) {
      return {
        kind: 'result',
        result: { recordId, status: 'DENIED', denyReason: 'PID_REUSE' }
      }
    }
    // s4 executable 校验（PID 复用防线二；严格一致性，含缺失）
    if (proc.executablePath !== record.process.executablePath) {
      return {
        kind: 'result',
        result: { recordId, status: 'DENIED', denyReason: 'PID_REUSE' }
      }
    }
    // s5 用重读数据重算保护级（SYSTEM/SYSTEM_CRITICAL/UNKNOWN 一律拒绝）
    const securityInput: SecurityInput = {
      pid: proc.pid,
      uid: proc.uid,
      user: proc.user,
      executablePath: proc.executablePath
    }
    const level: PortRecord['security']['level'] = this.deps.classifier.classify(securityInput)
    if (level !== 'USER') {
      return {
        kind: 'result',
        result: { recordId, status: 'DENIED', denyReason: 'PROTECTED', protectionLevel: level }
      }
    }
    return { kind: 'ok', pid: record.pid }
  }

  private audit(recordId: string, phase: string, detail: string): void {
    const line = `action=terminate recordId=${recordId} phase=${phase} ${detail}`
    if (this.deps.audit !== undefined) {
      this.deps.audit(line)
      return
    }
    console.log(`[portgate] [audit] ${line}`)
  }
}
