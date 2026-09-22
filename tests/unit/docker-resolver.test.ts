/**
 * DockerResolver 测试（方案 §5.9 / R-04，fixture 驱动）：
 * docker ps 端口映射多段解析（IPv4/IPv6/仅容器端口段）、匹配规则
 * （localPort==hostPort + wildcard/精确 hostIp）、10s 节流、daemon 失败静默降级。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseDockerPs, DockerResolver } from '../../src/main/core/resolve/DockerResolver'

const FIXTURE_OUTPUT = readFileSync(resolve(process.cwd(), 'tests/fixtures/docker-ps.txt'), 'utf-8')

describe('docker ps 输出解析（docker-ps.txt）', () => {
  it('多段映射逐条解析（IPv4/IPv6 hostIp、tcp 协议）', () => {
    const mappings = parseDockerPs(FIXTURE_OUTPUT)
    expect(mappings).toHaveLength(5)
    expect(mappings[0]).toEqual({
      container: 'mysql-server',
      image: 'mysql:8.0',
      hostIp: '0.0.0.0',
      hostPort: 15433,
      protocol: 'tcp'
    })
    expect(mappings[1]).toEqual({
      container: 'mysql-server',
      image: 'mysql:8.0',
      hostIp: '::',
      hostPort: 15433,
      protocol: 'tcp'
    })
  })

  it('仅容器端口段（9229/tcp，无宿主映射）被跳过', () => {
    const mappings = parseDockerPs(FIXTURE_OUTPUT)
    expect(mappings.filter((mapping) => mapping.hostPort === 9229)).toHaveLength(0)
    expect(mappings.filter((mapping) => mapping.container === 'ci-buddy-web')).toHaveLength(2)
  })

  it('127.0.0.1 精确绑定解析', () => {
    const mappings = parseDockerPs(FIXTURE_OUTPUT)
    expect(mappings[4]).toEqual({
      container: 'redis-cache',
      image: 'redis:7',
      hostIp: '127.0.0.1',
      hostPort: 16379,
      protocol: 'tcp'
    })
  })

  it('空输出/畸形行安全解析', () => {
    expect(parseDockerPs('')).toEqual([])
    expect(parseDockerPs('only-three-columns')).toEqual([])
  })
})

describe('匹配规则（方案 §5.9）', () => {
  // 直接注入解析结果缓存（绕过 spawn；解析正确性已由上组用例覆盖）
  function injectMappings(
    resolver: DockerResolver,
    mappings: ReturnType<typeof parseDockerPs>
  ): void {
    ;(resolver as unknown as { mappings: ReturnType<typeof parseDockerPs> }).mappings = mappings
  }

  const resolver = new DockerResolver(() => 1_000_000)
  injectMappings(resolver, parseDockerPs(FIXTURE_OUTPUT))

  it('wildcard 地址匹配任意 hostIp 绑定', () => {
    expect(resolver.match('*', 15433)).toEqual({ name: 'mysql-server', image: 'mysql:8.0' })
    expect(resolver.match('0.0.0.0', 3000)).toEqual({ name: 'ci-buddy-web', image: 'node:20-alpine' })
    expect(resolver.match('::', 3000)).toEqual({ name: 'ci-buddy-web', image: 'node:20-alpine' })
  })

  it('具体地址与 hostIp 精确匹配；不匹配端口返回 undefined', () => {
    expect(resolver.match('127.0.0.1', 16379)).toEqual({ name: 'redis-cache', image: 'redis:7' })
    expect(resolver.match('127.0.0.1', 15433)).toBeUndefined()
    expect(resolver.match('*', 9999)).toBeUndefined()
  })
})

describe('节流与静默降级（R-04）', () => {
  it('10s 节流：窗口内不重复刷新', async () => {
    let now = 1_000_000
    const resolver = new DockerResolver(() => now, 10_000)
    const fetchSpy = vi.spyOn(resolver as unknown as { fetchMappings: () => Promise<never[]> }, 'fetchMappings')
    fetchSpy.mockResolvedValue([])
    await resolver.refresh()
    await resolver.refresh()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    now += 10_001
    await resolver.refresh()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('docker 不存在（spawn error）/ 非零退出 → 静默降级为空（不抛错）', async () => {
    let now = 2_000_000
    const resolver = new DockerResolver(() => now, 10_000)
    const fetchSpy = vi.spyOn(resolver as unknown as { fetchMappings: () => Promise<never[]> }, 'fetchMappings')
    fetchSpy.mockRejectedValue(new Error('spawn docker ENOENT'))
    await expect(resolver.refresh()).resolves.toBeUndefined()
    fetchSpy.mockResolvedValue([])
    now += 10_001
    await expect(resolver.refresh()).resolves.toBeUndefined()
    expect(resolver.match('*', 15433)).toBeUndefined()
  })
})
