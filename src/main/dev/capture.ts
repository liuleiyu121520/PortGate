/**
 * UI 重构截图采集（方案 §10 / UI-AC-25，PORTGATE_CAPTURE=1 dev-only 门控）：
 * 九状态 × 双主题 18 张（暗色先行）+ 2560×1600 档表格三态 × 双主题 6 张 = 24 张，
 * 写入 <projectRoot>/screenshots/（.gitignore 覆盖，不入库）并生成 manifest 清单文件。
 * 复用 SMOKE 探针惯例：仅 !app.isPackaged 进入（MINOR-UIR2-002）；采集完成自动 app.quit() 收口，
 * 不留长驻进程。arch-boundary 扫描范围不含 src/main/dev/（node http/fs/child_process 在此合法）。
 *
 * 确定性时序（视觉走查返工后加固）：全部状态切换以 DOM 条件轮询驱动（waitForDom），
 * 每张截图前经双 requestAnimationFrame 确保新帧；capture 模式窗口关闭 backgroundThrottling，
 * 避免 occlusion 节流导致 capturePage 取到陈旧帧。
 *
 * 状态构造（§10.1）：
 * - 历史会话：主进程内起停 127.0.0.1:18123 HTTP 服务（PORT_OPENED 落库 → PORT_CLOSED 收口）；
 * - 确认弹窗：点击首个可用「结束」→ 截图后点击「取消」，不真正终止任何进程；
 * - PENDING_FORCE 强制弹窗：编译 SIGTERM-忽略监听器至用户域 ~/.portgate-capture（SecurityClassifier
 *   规则 6 判 USER），spawn 后按 PID 轮询快照确认（防陈旧端口占用误绑）；cc 不可用或流程超时改道人工采集。
 */
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'
import type { PortManager } from '../core/port/PortManager'

export interface UiCaptureDeps {
  window: BrowserWindow
  portManager: PortManager
}

interface CaptureResult {
  file: string
  state: string
  theme: string
  anchor: string
  ok: boolean
  note?: string
}

interface ForceHelper {
  binaryPath: string
  children: ChildProcess[]
}

const HISTORY_PORT = 18123
const FORCE_PORT = 18124
const OUTPUT_DIR_NAME = 'screenshots'
const FORCE_WORKDIR = join(homedir(), '.portgate-capture')
const WIDE_WIDTH = 2560
const WIDE_HEIGHT = 1600
/** PENDING_FORCE 弹窗标题（与 renderer COPY.messages.forceTitle 同文，capture 侧独立常量） */
const FORCE_MODAL_TITLE = '进程未响应 SIGTERM'

const THEME_ORDER: readonly ('dark' | 'light')[] = ['dark', 'light']

/** 九状态锚点说明（§10.1 走查口径，manifest 同源） */
const STATE_ANCHORS: Record<string, string> = {
  '01-list': '列表：行单行/hairline/无红色元素/无斑马纹/列宽分布',
  '02-search': '搜索态（关键词 node）：高亮 mark 形态/排序/语义色 ≤1',
  '03-drawer': '详情抽屉：左缘 18px/11px 内嵌块/中文分区（应用与项目首区）/按钮语法/十项信息',
  '04-history': '历史 Tab：分段控件/区间时长格式/PROJECT 并入进程列',
  '05-confirm': '确认弹窗：红 pill 主钮/scrim/18px/文案（截图后点取消，不终止）',
  '06-force': '强制弹窗（PENDING_FORCE）：「进程未响应 SIGTERM」文案/红主钮/scrim',
  '07-settings': '设置 popover：11px 面/hairline/周期三档文案/锚定位置',
  '08-empty': '空态（搜索 zzzz）：空态文案/居中/无残骸',
  '09-disabled': '禁用态（搜索 SYSTEM）：禁用对比/tooltip 锚点/无红色'
}

const WIDE_ANCHOR = '2560 档表格承载态：无横向滚动/无 ≥200px 死空间列/地址列弹性伸展'

/** 忽略 SIGTERM 的最小 TCP 监听器（与阶段 4 探针同源，编入用户域以满足 SecurityClassifier 规则 6） */
const FORCE_IGNORE_C = `#include <signal.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
int main(int argc, char **argv) {
  int port = argc > 1 ? atoi(argv[1]) : 18124;
  signal(SIGTERM, SIG_IGN);
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons((unsigned short)port);
  if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) return 1;
  if (listen(fd, 4) != 0) return 1;
  for (;;) {
    int client = accept(fd, 0, 0);
    if (client >= 0) { close(client); }
  }
}
`

function log(line: string): void {
  console.log(`[portgate] [CAPTURE] ${line}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function evalJs<T>(window: BrowserWindow, script: string): Promise<T> {
  return (await window.webContents.executeJavaScript(script, true)) as T
}

/** 轮询 DOM 条件直至成立或超时（确定性状态机，替代盲等固定 sleep） */
async function waitForDom(
  window: BrowserWindow,
  expression: string,
  label: string,
  timeoutMs = 8000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await evalJs<boolean>(window, `Boolean(${expression})`)
    if (ok) {
      return true
    }
    await sleep(120)
  }
  log(`DOM 条件等待超时：${label}`)
  return false
}

/** 双 rAF：保证 renderer 产出一帧新画面（配合 backgroundThrottling=false，杜绝 capturePage 陈旧帧） */
async function nextFrame(window: BrowserWindow): Promise<void> {
  await evalJs(
    window,
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
}

/** 起临时 HTTP 监听（主进程内 fs/http 合法；关闭由 close() 承担） */
function startHttpServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.end('ok')
    })
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

/** 轮询快照直至目标端口以指定 pid 出现/消失（pid 校验防陈旧端口占用误绑） */
async function waitForPortPid(
  portManager: PortManager,
  port: number,
  pid: number | null,
  present: boolean
): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const record = portManager.listSnapshot().records.find((item) => item.localPort === port)
    const matched =
      present && pid !== null
        ? record !== undefined && record.pid === pid
        : present
          ? record !== undefined
          : record === undefined
    if (matched) {
      return true
    }
    await sleep(400)
  }
  return false
}

/** 防御：清掉上一轮异常退出可能残留的助手监听（capture 专用端口，pid 归属校验后回收） */
async function ensureForcePortFree(portManager: PortManager, port: number): Promise<void> {
  const record = portManager.listSnapshot().records.find((item) => item.localPort === port)
  if (record === undefined) {
    return
  }
  log(`端口 ${port} 被既有进程 pid=${record.pid} 占用，先行回收`)
  try {
    process.kill(record.pid, 'SIGKILL')
  } catch {
    // 已退出忽略
  }
  await waitForPortPid(portManager, port, null, false)
}

/* ------------------------------ DOM 驱动（executeJavaScript，不受页面 CSP 限制） ------------------------------ */

async function setTheme(window: BrowserWindow, theme: 'dark' | 'light'): Promise<void> {
  const ok = await evalJs<boolean>(
    window,
    `window.__portgateDevSmoke
      ? window.__portgateDevSmoke.settings.setTheme(${JSON.stringify(theme)})
      : false`
  )
  if (!ok) {
    log(`主题切换 ${theme} 失败（dev smoke 挂载点缺失）`)
  }
  // 等待 <html data-theme> 落地 + 0.2s 背景过渡结束（§10.2 400ms 口径取整）
  await waitForDom(
    window,
    `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
    `主题 ${theme} 生效`
  )
  await sleep(500)
}

async function driveSearch(window: BrowserWindow, keyword: string): Promise<void> {
  const ok = await evalJs<boolean>(
    window,
    `(() => {
      const input = document.querySelector('.pg-search__input')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(keyword)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`
  )
  if (!ok) {
    log(`搜索输入注入失败：${keyword}`)
    return
  }
  // 等 input 值落地（Vue 受控回写）+ 防抖 250ms + port:list 往返 + 渲染
  await waitForDom(
    window,
    `document.querySelector('.pg-search__input')?.value === ${JSON.stringify(keyword)}`,
    `搜索词 ${keyword} 回写`
  )
  await sleep(800)
}

async function clickSegment(window: BrowserWindow, tab: 'current' | 'history'): Promise<void> {
  const clicked = await evalJs<boolean>(
    window,
    `(() => {
      const seg = [...document.querySelectorAll('.pg-seg')].find((el) => el.dataset.tab === ${JSON.stringify(tab)})
      if (!seg) return false
      seg.click()
      return true
    })()`
  )
  if (!clicked) {
    log(`分段点击失败：${tab}`)
    return
  }
  await waitForDom(
    window,
    `document.querySelector('.pg-seg--active')?.dataset.tab === ${JSON.stringify(tab)}`,
    `分段 ${tab} 激活`
  )
  await sleep(600)
}

async function clickFirstRow(window: BrowserWindow): Promise<boolean> {
  const clicked = await evalJs<boolean>(
    window,
    `(() => {
      const row = document.querySelector('.pg-table__row')
      if (!row) return false
      row.click()
      return true
    })()`
  )
  if (!clicked) {
    return false
  }
  return waitForDom(window, `document.querySelector('.pg-drawer.ant-drawer-open')`, '抽屉打开')
}

async function closeDrawer(window: BrowserWindow): Promise<void> {
  await evalJs<boolean>(
    window,
    `(() => {
      const close = document.querySelector('.pg-drawer .ant-drawer-close')
      if (!close) return false
      close.click()
      return true
    })()`
  )
  await waitForDom(
    window,
    `!document.querySelector('.pg-drawer.ant-drawer-open')`,
    '抽屉关闭'
  )
  await sleep(300)
}

/** 点击指定端口行（force 流程）或首个可用行的「结束」，等待确认弹窗出现 */
async function openTerminateConfirm(window: BrowserWindow, port: number | null): Promise<boolean> {
  const clicked = await evalJs<boolean>(
    window,
    `(() => {
      const rows = ${port === null ? '[document.querySelector(`.pg-table__row`)].filter(Boolean)' : `[...document.querySelectorAll('.pg-table__row')].filter((el) => el.textContent?.includes(${JSON.stringify(String(port))}))`}
      const btn = rows.map((row) => row.querySelector('.pg-btn--terminate:not(:disabled)')).find(Boolean)
      if (!btn) return false
      btn.click()
      return true
    })()`
  )
  if (!clicked) {
    return false
  }
  return waitForDom(window, `document.querySelector('.pg-confirm .ant-modal-confirm')`, '确认弹窗出现')
}

/** 可见确认弹窗判定（几何可见性，机制无关：antd 关闭后可能保留 DOM 或以样式隐藏） */
const VISIBLE_CONFIRM_EXPR =
  `[...document.querySelectorAll('.pg-confirm .ant-modal-confirm')].filter((el) => ` +
  `el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none').length`

/** 可见设置 popover 判定（机制无关 + 全实例 some()：antd 可能保留隐藏实例，first-match 会被陈旧节点欺骗） */
const VISIBLE_POPOVER_EXPR =
  `[...document.querySelectorAll('.pg-popover')].some((el) => ` +
  `el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none')`

/** 点击可见确认弹窗按钮并等待其收口。
 * 单击 + 长耐心等待（20s ≫ SIGKILL 校验链路耗时）：盲目快速重试会在动作在途时双发
 * （第二发命中已消失记录 → 「记录已消失」toast 污染后续截图），仅超时后才补点一次。 */
async function clickModalButton(window: BrowserWindow, kind: 'cancel' | 'danger'): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const clicked = await evalJs<boolean>(
      window,
      `(() => {
        const visible = [...document.querySelectorAll('.pg-confirm .ant-modal-confirm')].filter((el) =>
          el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'
        )
        const btn = visible
          .map((modal) => modal.querySelector(${JSON.stringify(kind === 'cancel' ? '.ant-btn:not(.ant-btn-dangerous)' : '.ant-btn-dangerous')}))
          .find(Boolean)
        if (!btn) return false
        btn.click()
        return true
      })()`
    )
    if (!clicked) {
      return false
    }
    const closed = await waitForDom(
      window,
      `${VISIBLE_CONFIRM_EXPR} === 0`,
      `弹窗按钮 ${kind} 收口`,
      20000
    )
    if (closed) {
      return true
    }
    log(`弹窗按钮 ${kind} 第 ${attempt} 次点击未收口，重试`)
  }
  return false
}

/** 仅触发确认弹窗的红色 OK（PENDING_FORCE 会顶上二次弹窗，不等待收口） */
async function clickConfirmOkFireAndForget(window: BrowserWindow): Promise<boolean> {
  return evalJs<boolean>(
    window,
    `(() => {
      const visible = [...document.querySelectorAll('.pg-confirm .ant-modal-confirm')].filter((el) =>
        el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'
      )
      const btn = visible.map((modal) => modal.querySelector('.ant-btn-dangerous')).find(Boolean)
      if (!btn) return false
      btn.click()
      return true
    })()`
  )
}

/** 兜底收口：若有可见确认弹窗残留则点取消并等待消失 */
async function dismissConfirmModal(window: BrowserWindow): Promise<void> {
  if (await evalJs<boolean>(window, `${VISIBLE_CONFIRM_EXPR} > 0`)) {
    await clickModalButton(window, 'cancel')
  }
}

async function toggleSettingsPopover(window: BrowserWindow, open: boolean): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await evalJs<boolean>(
      window,
      `(() => {
        const trigger = document.querySelector('.pg-settings-trigger')
        if (!trigger) return false
        trigger.click()
        return true
      })()`
    )
    const settled = await waitForDom(
      window,
      `${open ? VISIBLE_POPOVER_EXPR : `!(${VISIBLE_POPOVER_EXPR})`}`,
      open ? '设置 popover 打开' : '设置 popover 关闭',
      5000
    )
    if (settled) {
      await sleep(200)
      return
    }
    log(
      `设置 popover ${open ? '打开' : '关闭'} 第 ${attempt} 次点击未生效，重试 ` +
        `(实例数 ${await evalJs<number>(window, `document.querySelectorAll('.pg-popover').length`)})`
    )
  }
}

/** 防御：确保无可见 popover 残留（08/09 等 07 之后的截图前调用）。
 * 先点收；若仍可见（幽灵复现/陈旧实例），内联 display:none 兜底保证画面干净。 */
async function ensureNoPopover(window: BrowserWindow): Promise<void> {
  if (await evalJs<boolean>(window, VISIBLE_POPOVER_EXPR)) {
    log('检测到 popover 残留，强制收口')
    await toggleSettingsPopover(window, false)
  }
  if (await evalJs<boolean>(window, VISIBLE_POPOVER_EXPR)) {
    const count = await evalJs<number>(window, `document.querySelectorAll('.pg-popover').length`)
    log(`popover 点击收口无效（实例数 ${count}），内联隐藏兜底`)
    await evalJs(
      window,
      `[...document.querySelectorAll('.pg-popover')].forEach((el) => { el.style.display = 'none' })`
    )
    await nextFrame(window)
  }
}

/** 等 message toast 消散（默认 3s 时长 + 动画），防污染下一状态截图 */
async function waitForToastsGone(window: BrowserWindow): Promise<void> {
  await waitForDom(
    window,
    `(!document.querySelector('.ant-message') || document.querySelector('.ant-message').children.length === 0)`,
    'toast 消散',
    6000
  )
}

/** 兜底复位：清掉可能残留的 popover/弹窗/抽屉与搜索词（防跨状态污染） */
async function resetUi(window: BrowserWindow): Promise<void> {
  if (await evalJs<boolean>(window, VISIBLE_POPOVER_EXPR)) {
    await toggleSettingsPopover(window, false)
  }
  await dismissConfirmModal(window)
  if (await evalJs<boolean>(window, `Boolean(document.querySelector('.pg-drawer.ant-drawer-open'))`)) {
    await closeDrawer(window)
  }
  await driveSearch(window, '')
  await clickSegment(window, 'current')
  await waitForToastsGone(window)
}

/* ------------------------------ PENDING_FORCE 助手 ------------------------------ */

function prepareForceHelper(): ForceHelper | null {
  if (spawnSync('cc', ['--version']).status !== 0) {
    log('cc 不可用：06-force 状态改道人工采集（方案 §10.1 既定分支）')
    return null
  }
  mkdirSync(FORCE_WORKDIR, { recursive: true })
  const sourcePath = join(FORCE_WORKDIR, 'ignore-term.c')
  const binaryPath = join(FORCE_WORKDIR, 'ignore-term-srv')
  writeFileSync(sourcePath, FORCE_IGNORE_C)
  const compile = spawnSync('cc', ['-O2', '-o', binaryPath, sourcePath])
  if (compile.status !== 0) {
    log('force 助手编译失败：06-force 状态改道人工采集')
    return null
  }
  return { binaryPath, children: [] }
}

function spawnForceHelper(helper: ForceHelper): boolean {
  const child = spawn(helper.binaryPath, [String(FORCE_PORT)], { stdio: 'ignore' })
  helper.children.push(child)
  return child.pid !== undefined
}

function cleanupForceHelper(helper: ForceHelper | null): void {
  if (helper === null) {
    return
  }
  // 收尾兜底 SIGKILL（「强制结束」点击失败时保证不留忽略 SIGTERM 的长驻进程）
  for (const child of helper.children) {
    try {
      if (child.pid !== undefined) {
        process.kill(child.pid, 'SIGKILL')
      }
    } catch {
      // 已退出忽略
    }
  }
  rmSync(FORCE_WORKDIR, { recursive: true, force: true })
}

/* ------------------------------ 采集主流程 ------------------------------ */

async function shot(
  window: BrowserWindow,
  stateId: string,
  theme: string,
  outputDir: string,
  results: CaptureResult[],
  anchor: string,
  suffix = '',
  note?: string
): Promise<void> {
  await nextFrame(window)
  await sleep(120) // 帧后稳定
  const image = await window.webContents.capturePage()
  const fileName = `${stateId}-${theme}${suffix}.png`
  const empty = image.isEmpty()
  writeFileSync(join(outputDir, fileName), empty ? Buffer.alloc(0) : image.toPNG())
  results.push({ file: fileName, state: stateId, theme, anchor, ok: !empty, note })
  log(`${empty ? 'EMPTY' : 'OK'} ${fileName}`)
}

/** 单主题九状态（§10.1 顺序：列表 → 搜索 → 抽屉 → 历史 → 确认 → 强制 → 设置 → 空态 → 禁用） */
async function captureThemeStates(
  window: BrowserWindow,
  portManager: PortManager,
  theme: 'dark' | 'light',
  outputDir: string,
  results: CaptureResult[],
  forceHelper: ForceHelper | null
): Promise<void> {
  await resetUi(window)
  await shot(window, '01-list', theme, outputDir, results, STATE_ANCHORS['01-list'])

  await driveSearch(window, 'node')
  await shot(window, '02-search', theme, outputDir, results, STATE_ANCHORS['02-search'])
  await driveSearch(window, '')

  if (await clickFirstRow(window)) {
    await shot(window, '03-drawer', theme, outputDir, results, STATE_ANCHORS['03-drawer'])
    await closeDrawer(window)
  } else {
    results.push({ file: `03-drawer-${theme}.png`, state: '03-drawer', theme, anchor: STATE_ANCHORS['03-drawer'], ok: false, note: '无可用行' })
  }

  await clickSegment(window, 'history')
  await shot(window, '04-history', theme, outputDir, results, STATE_ANCHORS['04-history'])
  await clickSegment(window, 'current')

  if (await openTerminateConfirm(window, null)) {
    await shot(window, '05-confirm', theme, outputDir, results, STATE_ANCHORS['05-confirm'])
    // 点取消，不终止任何真实进程
    await clickModalButton(window, 'cancel')
  } else {
    results.push({ file: `05-confirm-${theme}.png`, state: '05-confirm', theme, anchor: STATE_ANCHORS['05-confirm'], ok: false, note: '无 USER 级行，改道人工采集' })
  }

  await captureForceState(window, portManager, theme, outputDir, results, forceHelper)

  await toggleSettingsPopover(window, true)
  await shot(window, '07-settings', theme, outputDir, results, STATE_ANCHORS['07-settings'])
  await toggleSettingsPopover(window, false)
  await ensureNoPopover(window)

  await driveSearch(window, 'zzzz')
  await ensureNoPopover(window)
  await shot(window, '08-empty', theme, outputDir, results, STATE_ANCHORS['08-empty'])
  await driveSearch(window, '')

  await driveSearch(window, 'SYSTEM')
  await ensureNoPopover(window)
  await shot(window, '09-disabled', theme, outputDir, results, STATE_ANCHORS['09-disabled'])
  await driveSearch(window, '')
  await resetUi(window)
}

/** PENDING_FORCE 强制弹窗（§10.1 #11/12：脚本起忽略 SIGTERM 的监听进程） */
async function captureForceState(
  window: BrowserWindow,
  portManager: PortManager,
  theme: 'dark' | 'light',
  outputDir: string,
  results: CaptureResult[],
  forceHelper: ForceHelper | null
): Promise<void> {
  const miss = (note: string): void => {
    results.push({ file: `06-force-${theme}.png`, state: '06-force', theme, anchor: STATE_ANCHORS['06-force'], ok: false, note })
  }
  await ensureForcePortFree(portManager, FORCE_PORT)
  if (forceHelper === null || !spawnForceHelper(forceHelper)) {
    miss('force 助手不可用，改道人工采集')
    return
  }
  const pid = forceHelper.children[forceHelper.children.length - 1]?.pid
  if (pid === undefined || !(await waitForPortPid(portManager, FORCE_PORT, pid, true))) {
    miss('force 助手端口未按 pid 进入快照')
    return
  }
  // 过滤到助手端口行 → 结束 → 确认（红色 OK）→ KillPolicy 3s 宽限转 PENDING_FORCE
  await driveSearch(window, String(FORCE_PORT))
  if (!(await openTerminateConfirm(window, FORCE_PORT))) {
    miss('助手行无可用结束按钮')
    await driveSearch(window, '')
    return
  }
  // 触发 OK 但不等待收口：PENDING_FORCE 时二次弹窗（同为 .pg-confirm）会立即顶上
  if (!(await clickConfirmOkFireAndForget(window))) {
    miss('确认弹窗 OK 点击失败')
    await dismissConfirmModal(window)
    await driveSearch(window, '')
    return
  }
  // 按标题精确等待可见的 PENDING_FORCE 弹窗（3s 宽限由 KillPolicy 承担）
  const forceModalUp = await waitForDom(
    window,
    `[...document.querySelectorAll('.pg-confirm .ant-modal-confirm')].some((el) => ` +
      `el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none' && ` +
      `el.querySelector('.ant-modal-confirm-title')?.textContent === ${JSON.stringify(FORCE_MODAL_TITLE)})`,
    'PENDING_FORCE 弹窗出现',
    12000
  )
  if (!forceModalUp) {
    miss('未出现 PENDING_FORCE 弹窗，改道人工采集')
    await dismissConfirmModal(window)
    await driveSearch(window, '')
    return
  }
  await shot(window, '06-force', theme, outputDir, results, STATE_ANCHORS['06-force'])
  // 点击「强制结束」收尾（SIGKILL 由主进程 KillPolicy 执行），等待全部弹窗关闭并等 toast 消散
  await clickModalButton(window, 'danger')
  await waitForToastsGone(window)
  await driveSearch(window, '')
}

/** 2560 档第二遍（§10.2 M-02）：表格承载态（列表/搜索态/历史）× 双主题 */
async function captureWideStates(
  window: BrowserWindow,
  theme: 'dark' | 'light',
  outputDir: string,
  results: CaptureResult[]
): Promise<void> {
  await resetUi(window)
  await shot(window, '01-list', theme, outputDir, results, WIDE_ANCHOR, '-2560')
  await driveSearch(window, 'node')
  await shot(window, '02-search', theme, outputDir, results, WIDE_ANCHOR, '-2560')
  await driveSearch(window, '')
  await clickSegment(window, 'history')
  await shot(window, '04-history', theme, outputDir, results, WIDE_ANCHOR, '-2560')
  await clickSegment(window, 'current')
  await resetUi(window)
}

function writeManifest(outputDir: string, results: CaptureResult[]): void {
  const passed = results.filter((item) => item.ok).length
  const lines: string[] = [
    '# PortGate UI 重构截图清单（方案 §10，UI-AC-25）',
    '',
    `- 采集时间：${new Date().toISOString()}`,
    `- 窗口档位：1280×800 主档（九状态 × 双主题 18 张，暗色先行）+ 2560×1600 档（表格三态 × 双主题 6 张）`,
    `- 采集结果：${passed}/${results.length} 张非空（不足 24 张或含空图时按 D-UI-C 分支处理）`,
    '',
    '| 文件 | 状态 | 主题 | 验收锚点 | 结果 |',
    '|---|---|---|---|---|'
  ]
  for (const item of results) {
    const note = item.note === undefined ? '' : `（${item.note}）`
    lines.push(`| ${item.file} | ${item.state} | ${item.theme} | ${item.anchor}${note} | ${item.ok ? 'OK' : 'MISS'} |`)
  }
  writeFileSync(join(outputDir, 'manifest.md'), `${lines.join('\n')}\n`)
  writeFileSync(
    join(outputDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), expected: 24, results }, null, 2)
  )
}

/**
 * 采集入口（main/index.ts 在 PORTGATE_CAPTURE=1 且 dev 下调用）：
 * 全部状态采集完成后自动 app.quit() 收口（SMOKE 探针惯例），并恢复采集前主题。
 */
export async function runUiCapture(deps: UiCaptureDeps): Promise<void> {
  const { window, portManager } = deps
  const outputDir = join(app.getAppPath(), OUTPUT_DIR_NAME)
  mkdirSync(outputDir, { recursive: true })
  const results: CaptureResult[] = []
  log(`开始采集，输出目录 ${outputDir}`)

  let historyServer: Server | null = null
  let forceHelper: ForceHelper | null = null
  const initialTheme = await evalJs<string>(
    window,
    `document.documentElement.dataset.theme || 'light'`
  )

  try {
    // 历史会话构造：起 → 入快照（PORT_OPENED 落库）→ 停 → 收口（PORT_CLOSED 写 closed_at）
    historyServer = await startHttpServer(HISTORY_PORT)
    if (await waitForPortPid(portManager, HISTORY_PORT, null, true)) {
      historyServer.close()
      historyServer = null
      const closed = await waitForPortPid(portManager, HISTORY_PORT, null, false)
      log(`历史会话构造完成（端口收口 ${closed ? '成功' : '超时'}）`)
    } else {
      log('历史会话构造失败：端口未进快照（04-history 将无新会话）')
    }

    forceHelper = prepareForceHelper()

    // 暗色先行（R-UI-4）
    for (const theme of THEME_ORDER) {
      await setTheme(window, theme)
      await captureThemeStates(window, portManager, theme, outputDir, results, forceHelper)
    }

    // 2560 档第二遍
    window.setSize(WIDE_WIDTH, WIDE_HEIGHT)
    await sleep(800)
    for (const theme of THEME_ORDER) {
      await setTheme(window, theme)
      await captureWideStates(window, theme, outputDir, results)
    }

    writeManifest(outputDir, results)
    log(`采集完成：${results.filter((item) => item.ok).length}/${results.length} 张（期望 24）`)
  } finally {
    if (historyServer !== null) {
      historyServer.close()
    }
    cleanupForceHelper(forceHelper)
    // 恢复采集前主题后收口（SMOKE 惯例：验证完成自动退出）
    await setTheme(window, initialTheme === 'dark' ? 'dark' : 'light')
    setTimeout(() => app.quit(), 500)
  }
}
