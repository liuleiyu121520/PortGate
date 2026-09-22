/**
 * 可检索字段单一常量表（方案 §5.12 / v1.2 m-04）：穷举需求 §4.2 全部 18 个字段
 * （字段 → PortRecord 取值路径 → 分值档位/匹配模式），架构测试断言本表覆盖需求全集
 * （无遗漏、无多余）。任何字段命中均产出高亮区间（需求 §4.4）。
 *
 * 档位口径（方案 §5.12 / 需求 §4.3）：
 * - 100：Port / PID 数字精确；
 * - 80 / 60：三名称（Process / Application / Project）精确 / 包含；
 * - 30：Command Line / Executable Path / Project Path / Working Directory / Container Name / Docker Image 包含；
 * - 10（默认档）：其余字段（Protocol / State / Local Address / Remote Address / PPID / User /
 *   Protection Level）——命中计 10 分，仅以极小权重参与 AND 命中与高亮，不承担排序主导。
 */

/** 关键词与字段值的匹配都基于小写化文本（大小写不敏感） */
export type SearchFieldMode = 'numberExact' | 'nameExactOrContains' | 'contains' | 'default'

export type SearchFieldId =
  | 'port'
  | 'protocol'
  | 'state'
  | 'localAddress'
  | 'remoteAddress'
  | 'pid'
  | 'ppid'
  | 'processName'
  | 'executablePath'
  | 'commandLine'
  | 'user'
  | 'applicationName'
  | 'projectName'
  | 'projectPath'
  | 'workingDirectory'
  | 'containerName'
  | 'containerImage'
  | 'protectionLevel'

export interface SearchFieldDefinition {
  id: SearchFieldId
  /** 需求 §4.2 字段名（原文） */
  label: string
  mode: SearchFieldMode
  /** 取值路径：undefined = 该记录此字段不可检索（字段位存在但值缺失不参与命中） */
  getValue: (record: import('../../../shared/types').PortRecord) => string | undefined
}

export const SEARCH_WEIGHTS = {
  /** Port / PID 数字精确（需求 §4.3 最高优先级） */
  NUMBER_EXACT: 100,
  /** 三名称精确 */
  NAME_EXACT: 80,
  /** 三名称包含 */
  NAME_CONTAINS: 60,
  /** 命令 / 路径 / 可执行 / CWD / 容器包含 */
  TEXT_CONTAINS: 30,
  /** 默认档（m-04）：仅参与 AND 命中与高亮，不承担排序主导权重 */
  DEFAULT: 10
} as const

export const SEARCH_FIELDS: readonly SearchFieldDefinition[] = [
  { id: 'port', label: 'Port', mode: 'numberExact', getValue: (r) => String(r.localPort) },
  { id: 'protocol', label: 'Protocol', mode: 'default', getValue: (r) => r.protocol },
  { id: 'state', label: 'State', mode: 'default', getValue: (r) => r.state },
  { id: 'localAddress', label: 'Local Address', mode: 'default', getValue: (r) => r.localAddress },
  { id: 'remoteAddress', label: 'Remote Address', mode: 'default', getValue: (r) => r.remoteAddress },
  { id: 'pid', label: 'PID', mode: 'numberExact', getValue: (r) => String(r.pid) },
  { id: 'ppid', label: 'PPID', mode: 'default', getValue: (r) => (r.process.ppid === undefined ? undefined : String(r.process.ppid)) },
  { id: 'processName', label: 'Process Name', mode: 'nameExactOrContains', getValue: (r) => r.process.name },
  { id: 'executablePath', label: 'Executable Path', mode: 'contains', getValue: (r) => r.process.executablePath },
  { id: 'commandLine', label: 'Command Line', mode: 'contains', getValue: (r) => r.process.commandLine },
  { id: 'user', label: 'User', mode: 'default', getValue: (r) => r.process.user },
  { id: 'applicationName', label: 'Application Name', mode: 'nameExactOrContains', getValue: (r) => r.application?.name },
  { id: 'projectName', label: 'Project Name', mode: 'nameExactOrContains', getValue: (r) => r.project?.name },
  { id: 'projectPath', label: 'Project Path', mode: 'contains', getValue: (r) => r.project?.path },
  { id: 'workingDirectory', label: 'Working Directory', mode: 'contains', getValue: (r) => r.process.workingDirectory },
  { id: 'containerName', label: 'Container Name', mode: 'contains', getValue: (r) => r.container?.name },
  { id: 'containerImage', label: 'Docker Image', mode: 'contains', getValue: (r) => r.container?.image },
  { id: 'protectionLevel', label: 'Protection Level', mode: 'default', getValue: (r) => r.security.level }
]
