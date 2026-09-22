/**
 * 项目 marker 常量与受限名称提取（方案 §5.8 / 需求 §9.2）：
 * - marker 按优先级排序（就近目录内先按此序匹配）；
 * - 名称提取（就近 marker）：package.json `name` → settings.gradle `rootProject.name` →
 *   pom.xml `artifactId` → Cargo.toml `[package] name` → go.mod module 末段 →
 *   pyproject.toml `name` → 目录名兜底；全部受限正则 + 长度上限，解析失败回退目录名。
 */
import type { ProjectInfo } from '../../../shared/types'

export interface MarkerDefinition {
  /** 命中文件/目录名 */
  marker: string
  /** 项目类型映射（需求 §9.2） */
  type: string
  /** 从 marker 文件文本提取项目名；返回 undefined → 目录名兜底（.git 等目录型无内容） */
  extractName?: (content: string) => string | undefined
}

/** 受限读取上限（避免超大文件读入） */
export const MARKER_READ_LIMIT_BYTES = 64 * 1024

/** 提取结果长度上限（受限正则防异常超长捕获） */
const NAME_MAX_LENGTH = 128

function bounded(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0 || value.length > NAME_MAX_LENGTH) {
    return undefined
  }
  return value
}

export const PROJECT_MARKERS: readonly MarkerDefinition[] = [
  {
    marker: 'package.json',
    type: 'node',
    extractName: (content) => {
      const match = /"name"\s*:\s*"([^"]+)"/.exec(content)
      return bounded(match?.[1])
    }
  },
  {
    marker: 'pnpm-workspace.yaml',
    type: 'node'
  },
  {
    marker: 'yarn.lock',
    type: 'node'
  },
  {
    marker: 'pom.xml',
    type: 'java',
    extractName: (content) => {
      const match = /<artifactId>\s*([^<\s][^<]*?)\s*<\/artifactId>/.exec(content)
      return bounded(match?.[1])
    }
  },
  {
    marker: 'build.gradle',
    type: 'java'
  },
  {
    marker: 'settings.gradle',
    type: 'java',
    extractName: (content) => {
      const match = /rootProject\.name\s*=\s*['"]([^'"]+)['"]/.exec(content)
      return bounded(match?.[1])
    }
  },
  {
    marker: 'Cargo.toml',
    type: 'rust',
    extractName: (content) => {
      // [package] 段内的 name = "..."（受限窗口 512 字符，防跨段误匹配）
      const match = /\[package\][\s\S]{0,512}?^\s*name\s*=\s*"([^"]+)"/m.exec(content)
      return bounded(match?.[1])
    }
  },
  {
    marker: 'go.mod',
    type: 'go',
    extractName: (content) => {
      const match = /^module\s+(\S+)/m.exec(content)
      const modulePath = match?.[1]
      if (modulePath === undefined) {
        return undefined
      }
      // module 末段
      const segments = modulePath.split('/')
      return bounded(segments[segments.length - 1])
    }
  },
  {
    marker: 'pyproject.toml',
    type: 'python',
    extractName: (content) => {
      const match = /^\s*name\s*=\s*"([^"]+)"/m.exec(content)
      return bounded(match?.[1])
    }
  },
  {
    marker: 'requirements.txt',
    type: 'python'
  },
  {
    marker: '.git',
    type: 'git'
  }
]

/** 构造 marker 命中的 ProjectInfo（name 兜底目录名） */
export function buildProjectInfo(
  definition: MarkerDefinition,
  projectPath: string,
  extractedName: string | undefined
): ProjectInfo {
  const directoryName = projectPath.split('/').pop() ?? projectPath
  const name = extractedName ?? (directoryName.length > 0 ? directoryName : undefined)
  return { name, path: projectPath, type: definition.type, marker: definition.marker }
}
