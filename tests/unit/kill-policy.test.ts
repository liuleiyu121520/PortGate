/**
 * KillPolicy 状态机测试（方案 §5.11 / 需求 §15/§17，AC-08）：
 * fake adapter + fake clock 全分支：USER 放行闭环、宽限超时转 PENDING_FORCE、
 * force 二次校验 + SIGKILL、RECORD_GONE、ALREADY_EXITED、PID 复用两例、
 * 三级保护拒绝、EPERM FAILED、退出确认回调（触发即时重扫）。
 */
import { describe, expect, it, vi } from 'vitest'
import type { PortRecord, TerminateResult } from '../../src/shared/types'
import type { RawProcess } from '../../src/main/platform/types'
import { KillPolicy } from '../../src/main/core/security/KillPolicy'
import type { KillClock, KillPolicyDeps } from '../../src/main/core/security/KillPolicy'
import { SecurityClassifier } from '../../src/main/core/security/SecurityClassifier'

function mkRecord(pid: number, overrides: Partial<PortRecord> = {}): PortRecord {
  return {
    recordId: `TCP:127.0.0.1:8080:${pid}`,
    protocol: 'TCP',
    localAddress: '127.0.0.1',
    localPort: 8080,
    pid,
    process: {
      pid,
      name: 'srv',
      executablePath: '/Users/leiyu/work/srv',
      user: 'leiyu',
      uid: 501,
      startedAt: 111111
    },
    timing: { firstSeen: 0, lastSeen: 0 },
    security: { level: 'USER' },
    ...overrides
  }
}

function mkRawProcess(pid: number, overrides: Partial<RawProcess> = {}): RawProcess {
  return {
    pid,
    ppid: 1,
    uid: 501,
    user: 'leiyu',
    startedAt: 111111,
    cpuPercent: 0,
    memPercent: 0,
    executablePath: '/Users/leiyu/work/srv',
    commandLine: 'srv',
    ...overrides
  }
}

/** fake clock：now 手动推进，sleep 同步推进（无真实等待，轮询有限次收敛） */
function fakeClock(start = 1_000_000): KillClock & { advance: (ms: number) => void } {
  let t = start
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
    advance: (ms: number) => {
      t += ms
    }
  }
}

interface Harness {
  policy: KillPolicy
  store: Map<string, PortRecord>
  processes: Map<number, RawProcess | null>
  terminateProcess: ReturnType<typeof vi.fn>
  audit: string[]
  clock: ReturnType<typeof fakeClock>
  onExitConfirmed: ReturnType<typeof vi.fn>
}

function buildHarness(options: {
  snapshotRecord?: PortRecord | null
  rereadProcess?: RawProcess | null
  terminateError?: Error
} = {}): Harness {
  const store = new Map<string, PortRecord>()
  if (options.snapshotRecord !== undefined && options.snapshotRecord !== null) {
    store.set(options.snapshotRecord.recordId, options.snapshotRecord)
  }
  const processes = new Map<number, RawProcess | null>()
  if (options.rereadProcess !== undefined) {
    if (options.rereadProcess !== null) {
      processes.set(options.rereadProcess.pid, options.rereadProcess)
    }
  }
  const terminateProcess = vi.fn(async () => {
    if (options.terminateError !== undefined) {
      throw options.terminateError
    }
  })
  const audit: string[] = []
  const onExitConfirmed = vi.fn()
  const clock = fakeClock()
  const deps: KillPolicyDeps = {
    findRecord: (recordId) => store.get(recordId) ?? null,
    getProcess: async (pid) => processes.get(pid) ?? null,
    terminateProcess,
    classifier: new SecurityClassifier(501),
    clock,
    onExitConfirmed,
    audit: (line) => {
      audit.push(line)
    }
  }
  return { policy: new KillPolicy(deps), store, processes, terminateProcess, audit, clock, onExitConfirmed }
}

describe('USER 放行闭环（AC-09 底座）', () => {
  it('SIGTERM 后进程退出 → DONE + 触发即时重扫回调', async () => {
    const record = mkRecord(4242)
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: mkRawProcess(4242) })
    // 退出确认：terminate 后从重读表移除
    harness.terminateProcess.mockImplementation(async () => {
      harness.processes.delete(4242)
    })
    const result = await harness.policy.terminate(record.recordId)
    expect(result).toEqual({ recordId: record.recordId, status: 'DONE' })
    expect(harness.terminateProcess).toHaveBeenCalledWith(4242, false)
    expect(harness.onExitConfirmed).toHaveBeenCalledWith(record.recordId, false)
    // 审计留痕（安全红线）
    expect(harness.audit.some((line) => line.includes('SIGTERM'))).toBe(true)
  })

  it('重读发现进程已死 → DONE:ALREADY_EXITED（不执行信号）', async () => {
    const record = mkRecord(4243)
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: null })
    const result = await harness.policy.terminate(record.recordId)
    expect(result).toEqual({ recordId: record.recordId, status: 'DONE', detail: 'ALREADY_EXITED' })
    expect(harness.terminateProcess).not.toHaveBeenCalled()
  })

  it('宽限 3s 内未退出 → PENDING_FORCE（轮询 200ms × 15 次后超时）', async () => {
    const record = mkRecord(4244)
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: mkRawProcess(4244) })
    const result = await harness.policy.terminate(record.recordId)
    expect(result.status).toBe('PENDING_FORCE')
    expect(harness.onExitConfirmed).not.toHaveBeenCalled()
    // fake clock 总推进 = 15 次 × 200ms = 3000ms（宽限期边界）
    expect(harness.clock.now()).toBe(1_000_000 + 15 * 200)
  })
})

describe('PID 复用防线（AC-08，两例）', () => {
  it('s3 startTime 不一致 → DENIED:PID_REUSE', async () => {
    const record = mkRecord(4245)
    const reread = mkRawProcess(4245, { startedAt: 999999 })
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: reread })
    const result = await harness.policy.terminate(record.recordId)
    expect(result).toEqual({ recordId: record.recordId, status: 'DENIED', denyReason: 'PID_REUSE' })
    expect(harness.terminateProcess).not.toHaveBeenCalled()
  })

  it('s4 executablePath 不一致 → DENIED:PID_REUSE', async () => {
    const record = mkRecord(4246)
    const reread = mkRawProcess(4246, { executablePath: '/usr/bin/node' })
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: reread })
    const result = await harness.policy.terminate(record.recordId)
    expect(result).toEqual({ recordId: record.recordId, status: 'DENIED', denyReason: 'PID_REUSE' })
    expect(harness.terminateProcess).not.toHaveBeenCalled()
  })
})

describe('保护级拒绝（AC-10 底座）', () => {
  const levels: Array<{ level: string; uid: number; user: string; executablePath: string }> = [
    { level: 'SYSTEM', uid: 0, user: 'root', executablePath: '/usr/sbin/syslogd' },
    { level: 'SYSTEM_CRITICAL', uid: 0, user: 'root', executablePath: '/usr/libexec/logd' },
    { level: 'UNKNOWN', uid: 502, user: 'other', executablePath: '/Volumes/x/srv' }
  ]
  for (const item of levels) {
    it(`重算保护级 ${item.level} → DENIED:PROTECTED 并附级别`, async () => {
      const record = mkRecord(4300, {
        security: { level: item.level as PortRecord['security']['level'] },
        process: {
          pid: 4300,
          name: 'proc',
          executablePath: item.executablePath,
          user: item.user,
          uid: item.uid,
          startedAt: 111111
        }
      })
      const reread = mkRawProcess(4300, {
        uid: item.uid,
        user: item.user,
        executablePath: item.executablePath
      })
      const harness = buildHarness({ snapshotRecord: record, rereadProcess: reread })
      const result: TerminateResult = await harness.policy.terminate(record.recordId)
      expect(result).toEqual({
        recordId: record.recordId,
        status: 'DENIED',
        denyReason: 'PROTECTED',
        protectionLevel: item.level
      })
      expect(harness.terminateProcess).not.toHaveBeenCalled()
    })
  }
})

describe('RECORD_GONE 与 FAILED', () => {
  it('快照中不存在 → DENIED:RECORD_GONE', async () => {
    const harness = buildHarness({})
    const result = await harness.policy.terminate('TCP:127.0.0.1:9999:1')
    expect(result).toEqual({ recordId: 'TCP:127.0.0.1:9999:1', status: 'DENIED', denyReason: 'RECORD_GONE' })
  })

  it('SIGTERM 系统错误（如 EPERM）→ FAILED 附错误消息', async () => {
    const record = mkRecord(4301)
    const harness = buildHarness({
      snapshotRecord: record,
      rereadProcess: mkRawProcess(4301),
      terminateError: new Error('kill EPERM')
    })
    const result = await harness.policy.terminate(record.recordId)
    expect(result).toEqual({ recordId: record.recordId, status: 'FAILED', detail: 'kill EPERM' })
  })
})

describe('FORCE_EXECUTING（AC-11 底座）', () => {
  it('force：再次校验后 SIGKILL → DONE + 回调（force=true）', async () => {
    const record = mkRecord(4302)
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: mkRawProcess(4302) })
    harness.terminateProcess.mockImplementation(async () => {
      harness.processes.delete(4302)
    })
    const result = await harness.policy.forceTerminate(record.recordId)
    expect(result).toEqual({ recordId: record.recordId, status: 'DONE' })
    expect(harness.terminateProcess).toHaveBeenCalledWith(4302, true)
    expect(harness.onExitConfirmed).toHaveBeenCalledWith(record.recordId, true)
  })

  it('force 同样受保护级拒绝（不绕过校验）', async () => {
    const record = mkRecord(4303, {
      security: { level: 'SYSTEM_CRITICAL' },
      process: {
        pid: 4303,
        name: 'proc',
        executablePath: '/usr/libexec/logd',
        user: '_logd',
        uid: 205,
        startedAt: 111111
      }
    })
    const reread = mkRawProcess(4303, {
      executablePath: '/usr/libexec/logd',
      user: '_logd',
      uid: 205
    })
    const harness = buildHarness({ snapshotRecord: record, rereadProcess: reread })
    const result = await harness.policy.forceTerminate(record.recordId)
    expect(result).toEqual({
      recordId: record.recordId,
      status: 'DENIED',
      denyReason: 'PROTECTED',
      protectionLevel: 'SYSTEM_CRITICAL'
    })
    expect(harness.terminateProcess).not.toHaveBeenCalled()
  })
})
