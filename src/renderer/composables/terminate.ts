import { Modal, message } from 'ant-design-vue'
import type { PortRecord, TerminateResult } from '../../shared/types'
import { COPY, fill } from '../copy'

/**
 * 安全终止交互（需求 §15/§17，AC-09/10/11 UI 侧；UI 重构方案 §5.5 三级语法）：
 * - Renderer 只经白名单桥传 recordId（无任何 kill(pid) 能力）；
 * - 结束前确认框（含进程名/协议/端口/PID，文案入 COPY 表；红色主按钮唯一出现处）；
 * - 保护进程拒绝提示 warning→error（琥珀语义守卫，§4.1 派生裁定 6）；
 * - DENIED 按拒绝原因映射文案（System Protected 等）；
 * - PENDING_FORCE 升级二次确认「是否强制结束（SIGKILL）」；终态后由主进程触发即时重扫局部刷新。
 */
function denyText(result: TerminateResult): string {
  switch (result.denyReason) {
    case 'RECORD_GONE':
      return COPY.messages.denyRecordGone
    case 'PID_REUSE':
      return COPY.messages.denyPidReuse
    case 'PROTECTED':
      return fill(COPY.messages.denyProtected, { level: result.protectionLevel ?? 'PROTECTED' })
    default:
      return COPY.messages.denyGeneric
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
    message.error(
      fill(COPY.messages.terminateFailed, { detail: result.detail ?? COPY.messages.unknownError })
    )
  }

  function confirmTerminate(record: PortRecord): void {
    if (record.security.level !== 'USER') {
      // 琥珀语义守卫（§4.1 派生裁定 6）：保护拒绝为危险语义，message.warning → message.error
      message.error(fill(COPY.messages.denyProtected, { level: record.security.level }))
      return
    }
    if (running) {
      return
    }
    Modal.confirm({
      title: COPY.messages.terminateTitle,
      content: fill(COPY.messages.terminateContent, {
        process: record.process.name,
        protocol: record.protocol,
        port: record.localPort,
        pid: record.pid
      }),
      okText: COPY.actions.terminateProcess,
      // P1 修复：okType='danger' 会被 antd convertLegacyProps 转为默认危险变体（红字透明底），
      // 叠加红色填充覆盖后红字压红底不可读；改 primary 变体 + danger 标志 = 原生白字红底主按钮
      okType: 'primary',
      okButtonProps: { danger: true },
      cancelText: COPY.actions.cancel,
      // wrapClassName 落在 .ant-modal-wrap：base.less 以 .ant-modal-wrap.pg-confirm 提升覆盖优先级（§5.8）
      wrapClassName: 'pg-confirm',
      async onOk() {
        running = true
        try {
          const result = await window.portgate.terminatePort(record.recordId)
          if (result.status === 'PENDING_FORCE') {
            Modal.confirm({
              title: COPY.messages.forceTitle,
              content: fill(COPY.messages.forceContent, { process: record.process.name }),
              okText: COPY.actions.forceTerminate,
              okType: 'primary',
              okButtonProps: { danger: true },
              cancelText: COPY.actions.cancel,
              wrapClassName: 'pg-confirm',
              async onOk() {
                const forceResult = await window.portgate.forceTerminatePort(record.recordId)
                if (forceResult.status === 'DONE') {
                  message.success(COPY.messages.forced)
                  onSettled?.()
                } else {
                  reportFailure(forceResult)
                }
              }
            })
            return
          }
          if (result.status === 'DONE') {
            message.success(
              result.detail === 'ALREADY_EXITED' ? COPY.messages.alreadyExited : COPY.messages.terminated
            )
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
