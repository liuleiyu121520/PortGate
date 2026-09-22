/**
 * SecurityClassifier（方案 §5.10 / 需求 §16，AC-08/AC-10 底座）：
 * 输出 USER | SYSTEM | SYSTEM_CRITICAL | UNKNOWN。判定不依赖进程名，按序规则（命中即返回）：
 * 1. pid <= 1 → SYSTEM_CRITICAL；
 * 2. executablePath 前缀 /System/ 或 /usr/libexec/ → SYSTEM_CRITICAL；
 * 3. executablePath 前缀 /usr/sbin/、/usr/bin/、/sbin/、/private/var/db/ → SYSTEM；
 * 4. user 匹配 ^_（macOS 服务账户）→ SYSTEM；
 * 5. uid === 0 且 executablePath 不在用户域 → SYSTEM；
 * 6. executablePath 在用户域（/Users/<home>/**、/Applications/**、/opt/homebrew/**、/usr/local/**）
 *    且 uid === 当前 uid → USER；
 * 7. 其余（无路径、外置卷、身份缺失等）→ UNKNOWN。
 * 路径前缀常量收敛于 src/shared/constants.ts。
 */
import {
  SYSTEM_CRITICAL_PATH_PREFIXES,
  SYSTEM_PATH_PREFIXES,
  USER_DOMAIN_PREFIXES
} from '../../../shared/constants'
import type { SecurityLevel } from '../../../shared/types'

export interface SecurityInput {
  pid: number
  uid?: number
  user?: string
  executablePath?: string
}

function hasAnyPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path.startsWith(prefix))
}

export class SecurityClassifier {
  private readonly currentUid: number

  constructor(currentUid: number = process.getuid?.() ?? -1) {
    this.currentUid = currentUid
  }

  classify(input: SecurityInput): SecurityLevel {
    const pid = input.pid
    const uid = input.uid ?? -1
    const user = input.user ?? ''
    const executablePath = input.executablePath ?? ''

    // 1. pid <= 1（init/launchd 及无效值）
    if (pid <= 1) {
      return 'SYSTEM_CRITICAL'
    }
    // 2. 高风险系统路径
    if (executablePath.length > 0 && hasAnyPrefix(executablePath, SYSTEM_CRITICAL_PATH_PREFIXES)) {
      return 'SYSTEM_CRITICAL'
    }
    // 3. 系统路径
    if (executablePath.length > 0 && hasAnyPrefix(executablePath, SYSTEM_PATH_PREFIXES)) {
      return 'SYSTEM'
    }
    // 4. macOS 服务账户（^_）
    if (/^_/.test(user)) {
      return 'SYSTEM'
    }
    // 5. root 且不在用户域
    if (uid === 0 && !hasAnyPrefix(executablePath, USER_DOMAIN_PREFIXES)) {
      return 'SYSTEM'
    }
    // 6. 用户域 + 当前 uid
    if (
      executablePath.length > 0 &&
      hasAnyPrefix(executablePath, USER_DOMAIN_PREFIXES) &&
      uid === this.currentUid
    ) {
      return 'USER'
    }
    // 7. 其余
    return 'UNKNOWN'
  }
}
