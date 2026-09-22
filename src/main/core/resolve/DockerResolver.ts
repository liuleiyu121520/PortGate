/**
 * DockerResolver（方案 §5.9 / R-04 尽力而为）：
 * - `docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}'` 解析
 *   `<hostIP>:<hostPort>-><containerPort>/<proto>` 多段映射（fixture 驱动）；
 * - 匹配：记录 localPort == hostPort 且 localAddress 为 wildcard/0.0.0.0/[::]/hostIP；
 * - 节流 10s 刷新；docker 不存在/daemon 不可达 → 静默跳过（不产生扫描失败，R-04）。
 */
import { spawn } from 'node:child_process'
import type { ContainerInfo } from '../../../shared/types'

/** 单条宿主端口映射 */
export interface DockerPortMapping {
  container: string
  image: string
  hostIp: string
  hostPort: number
  protocol: 'tcp' | 'udp'
}

const DOCKER_REFRESH_INTERVAL_MS = 10000
const DOCKER_TIMEOUT_MS = 3000

const WILDCARD_ADDRESSES: ReadonlySet<string> = new Set(['*', '0.0.0.0', '::', '[::]'])

export function parseDockerPs(output: string): DockerPortMapping[] {
  const mappings: DockerPortMapping[] = []
  for (const line of output.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue
    }
    const columns = line.split('\t')
    if (columns.length < 4) {
      continue
    }
    const container = columns[1].trim()
    const image = columns[2].trim()
    for (const segment of columns[3].split(',')) {
      const match = /^\[?([^\]\s]+)\]?:(\d+)->(\d+)\/(tcp|udp)$/.exec(segment.trim())
      if (match === null) {
        continue
      }
      mappings.push({
        container,
        image,
        hostIp: match[1],
        hostPort: Number.parseInt(match[2], 10),
        protocol: match[4] as 'tcp' | 'udp'
      })
    }
  }
  return mappings
}

export class DockerResolver {
  private mappings: DockerPortMapping[] = []
  private lastRefresh = 0

  constructor(
    private readonly nowFn: () => number = () => Date.now(),
    private readonly refreshIntervalMs = DOCKER_REFRESH_INTERVAL_MS
  ) {}

  /** 每轮扫描调用；10s 节流，docker 不可达静默清空缓存（不抛错，双层兜底） */
  async refresh(): Promise<void> {
    const now = this.nowFn()
    if (now - this.lastRefresh < this.refreshIntervalMs) {
      return
    }
    this.lastRefresh = now
    try {
      this.mappings = await this.fetchMappings()
    } catch {
      // R-04 静默降级：任何刷新异常都不影响扫描流水线
      this.mappings = []
    }
  }

  /** 记录匹配：localPort == hostPort 且 localAddress 为 wildcard 或等于映射 hostIp */
  match(localAddress: string, localPort: number): ContainerInfo | undefined {
    for (const mapping of this.mappings) {
      if (mapping.hostPort !== localPort) {
        continue
      }
      const addressMatches =
        WILDCARD_ADDRESSES.has(localAddress) ||
        localAddress === mapping.hostIp ||
        `[${localAddress}]` === mapping.hostIp
      if (addressMatches) {
        return { name: mapping.container, image: mapping.image }
      }
    }
    return undefined
  }

  private fetchMappings(): Promise<DockerPortMapping[]> {
    return new Promise((resolve) => {
      let settled = false
      let stdout = ''
      const child = spawn(
        'docker',
        ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}'],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      )
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          child.kill('SIGKILL')
          resolve([])
        }
      }, DOCKER_TIMEOUT_MS)
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.on('error', () => {
        // docker 未安装：R-04 静默降级
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve([])
        }
      })
      child.on('close', (code) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        // daemon 不可达等非零退出：静默降级为空
        resolve(code === 0 ? parseDockerPs(stdout) : [])
      })
    })
  }
}
