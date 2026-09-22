import { Modal, message } from 'ant-design-vue'
import type { PortRecord, TerminateResult } from '../../shared/types'

/**
 * 安全终止交互（需求 §15/§17，AC-09/10/11 UI 侧）：
 * - Renderer 只经白名单桥传 recordId（无任何 kill(pid) 能力）；
 * - 结束前确认框（含进程名/端口）；DENIED 按拒绝原因映射文案（System Protected 等）；
 * - PENDING_FORCE 升级二次确认「是否强制结束（SIGKILL）」；终态后由主进程触发即时重扫局部刷新。
 */
function denyText(result: TerminateResult): string {
  switch (result.denyReason) {
    case 'RECORD_GONE':
      return '记录已消失，请刷新后重试'
    case 'PID_REUSE':
      return '进程身份已变化（PID 复用防护已拦截），已拒绝终止'
    case 'PROTECTED':
      return `System Protected（${result.protectionLevel ?? 'PROTECTED'}），禁止结束`
    default:
      return '终止被拒绝'
  }
}

export function useTerminate(onSettled?: () => void): {
  confirmTerminate: (record: PortRecord) => void
} {
  let running = false

  function reportFailure(result: TerminateResult): void {
    if (result.status === 'DENIED') {
      message.error(denyText(result))
      return
    }
    message.error(`终止失败：${result.detail ?? '未知错误'}`)
  }

  function confirmTerminate(record: PortRecord): void {
    if (record.security.level !== 'USER') {
      message.warning(`System Protected（${record.security.level}），禁止结束`)
      return
    }
    if (running) {
      return
    }
    Modal.confirm({
      title: '结束进程',
      content: `${record.process.name} · ${record.protocol} ${record.localPort}（PID ${record.pid}），确认结束该进程？`,
      okText: '结束进程',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        running = true
        try {
          const result = await window.portgate.terminatePort(record.recordId)
          if (result.status === 'PENDING_FORCE') {
            Modal.confirm({
              title: '进程未响应 SIGTERM',
              content: `${record.process.name} 未响应正常终止，是否强制结束（SIGKILL）？`,
              okText: '强制结束',
              okType: 'danger',
              cancelText: '取消',
              async onOk() {
                const forceResult = await window.portgate.forceTerminatePort(record.recordId)
                if (forceResult.status === 'DONE') {
                  message.success('已强制结束')
                  onSettled?.()
                } else {
                  reportFailure(forceResult)
                }
              }
            })
            return
          }
          if (result.status === 'DONE') {
            message.success(result.detail === 'ALREADY_EXITED' ? '进程已退出' : '进程已结束')
            onSettled?.()
            return
          }
          reportFailure(result)
        } finally {
          running = false
        }
      }
    })
  }

  return { confirmTerminate }
}
