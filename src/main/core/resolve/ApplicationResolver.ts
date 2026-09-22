/**
 * ApplicationResolver（方案 §5.7 / 需求 §9.1，AC-05）：
 * 从目标 pid 沿 PPID 上溯（复用 ProcessResolver 的全量表缓存与树上溯，不重复执行外部命令），
 * 命中 executablePath 含「任意路径下的 .app/Contents/」片段即返回：
 * name = .app 目录去后缀；path = .app 目录；bundleId 尽力读取 Contents/Info.plist
 * 中 CFBundleIdentifier（受限正则，失败为空，R-03）。
 * 上溯至 ppid≤1 / 深度上限未命中 → undefined（字段位保留）；进程自身即 GUI app 时直接返回自身。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ApplicationInfo } from '../../../shared/types'
import type { RawProcess } from '../../platform/types'

/** .app 内容路径模式（方案 §5.7：可执行位于任意 *.app 目录的 Contents 子树下） */
const APP_CONTENTS_PATTERN = /\.app\/Contents\//

/**
 * CFBundleIdentifier 受限正则（R-03：尽力读取，失败为空）。
 * 兼容两种 plist 形态：旧式 `CFBundleIdentifier = com.x.y;` 与 XML
 * `<key>CFBundleIdentifier</key><string>com.x.y</string>`。
 */
const BUNDLE_ID_PATTERN = /CFBundleIdentifier\s*(?:=|<\/key>\s*<string>)\s*"?([A-Za-z0-9.\-]+)/

export type RawProcessTree = (pid: number) => RawProcess[]

export interface ApplicationResolverOptions {
  /** Info.plist 文本读取器（默认读真实文件；测试可注入）；失败/超限返回 undefined */
  readPlist?: (appPath: string) => string | undefined
}

function defaultReadPlist(appPath: string): string | undefined {
  try {
    const content = readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf-8')
    return content.length > 512 * 1024 ? undefined : content
  } catch {
    return undefined
  }
}

/** 从可执行路径提取 .app 目录（含 .app 后缀）；不匹配返回 null */
export function extractAppBundle(executablePath: string): string | null {
  const index = executablePath.search(APP_CONTENTS_PATTERN)
  if (index < 0) {
    return null
  }
  return executablePath.slice(0, index + '.app'.length)
}

export class ApplicationResolver {
  private readonly readPlist: (appPath: string) => string | undefined

  constructor(options: ApplicationResolverOptions = {}) {
    this.readPlist = options.readPlist ?? defaultReadPlist
  }

  /** 沿进程树（含自身）向上查找宿主 .app；未命中返回 undefined（R-03 字段位保留） */
  resolve(tree: readonly RawProcess[]): ApplicationInfo | undefined {
    for (const proc of tree) {
      const appDir = extractAppBundle(proc.executablePath)
      if (appDir === null) {
        continue
      }
      const name = appDir.split('/').pop() ?? appDir
      return {
        name: name.replace(/\.app$/, ''),
        path: appDir,
        bundleId: this.readBundleId(appDir),
        sourcePid: proc.pid
      }
    }
    return undefined
  }

  private readBundleId(appDir: string): string | undefined {
    try {
      const content = this.readPlist(appDir)
      if (content === undefined) {
        return undefined
      }
      const match = BUNDLE_ID_PATTERN.exec(content)
      return match?.[1]
    } catch {
      return undefined
    }
  }
}
