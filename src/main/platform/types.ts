/**
 * PlatformAdapter 层类型（方案 §5.2：接口按需求 §13 原样；本文件是平台数据形态的唯一权威）。
 * RawPort / RawProcess 为平台探测原始产物（未组装 PortRecord），仅 main 进程消费。
 */
import type { ApplicationInfo } from '../../shared/types'

/** 单个监听 socket 的原始探测记录（MacAdapter 机器格式解析产物） */
export interface RawPort {
  pid: number
  /** 探测命令给出的进程命令名（ps 表缺失时的兜底进程名） */
  command: string
  protocol: 'TCP' | 'UDP'
  /** 本地地址（wildcard 为 `*`；IPv6 已去方括号，如 `::1`） */
  localAddress: string
  localPort: number
  /** 监听 socket 无远端；保留字段位（需求 §8） */
  remoteAddress: string | null
  remotePort: number | null
  /** TCP 取自 TST= 子字段（阶段 2 扫描域仅 LISTEN）；UDP 无状态恒为 null */
  state: 'LISTEN' | null
}

/** 单个进程的原始探测记录（两次进程命令输出按 pid join 后的产物，方案 §5.3） */
export interface RawProcess {
  pid: number
  ppid: number
  uid: number
  user: string
  /** 进程启动时间（本地时间 lstart 解析为 epoch ms；方案 §5.3 / KillPolicy startTime 校验基础） */
  startedAt: number
  cpuPercent: number
  memPercent: number
  /** 可执行路径（核心命令列尾整段，保留内部空格） */
  executablePath: string
  /** 完整命令行（第二条命令 -ww 防截断；缺失时为空串） */
  commandLine: string
}

/** 平台探测异常（非零退出/超时/启动失败；PortScanner 捕获后保留上一快照并推 SCAN_ERROR） */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterError'
  }
}

/**
 * 平台适配器统一接口。
 * - 前五个方法 = 需求 §13 PlatformAdapter 原样（getApplicationInfo 可选，阶段 4 应用识别走
 *   ProcessResolver 进程树，MacAdapter 阶段 2 不提供）；
 * - getProcessTable / getWorkingDirectories = 方案 §5.4 扫描流水线步骤 2/3 的批量支撑接口
 *   （方案 §5.3 命令表明确归属适配器层：进程核心+命令行两次调用按 pid join、批量工作目录）。
 */
export interface PlatformAdapter {
  /** 单次调用覆盖 TCP LISTEN + UDP（方案 §5.3 合并扫描命令） */
  scanPorts(): Promise<RawPort[]>

  getProcess(pid: number): Promise<RawProcess | null>

  /** 沿 PPID 上溯（深度上限 32，ppid≤1 止，含自身；方案 §5.6） */
  getProcessTree(pid: number): Promise<RawProcess[]>

  /** 仅由 KillPolicy（阶段 4）调用，renderer 不可达 */
  terminateProcess(pid: number, force?: boolean): Promise<void>

  getApplicationInfo?(pid: number): Promise<ApplicationInfo | null>

  /** 全量进程表（两条命令分别解析后按 pid join；每轮扫描刷新一次，方案 §5.6） */
  getProcessTable(): Promise<RawProcess[]>

  /** 批量取进程工作目录（仅对当前监听记录涉及且未缓存的 PID 调用；缺失 PID 不出现在结果中） */
  getWorkingDirectories(pids: number[]): Promise<Map<number, string>>
}
