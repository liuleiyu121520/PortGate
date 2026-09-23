import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { registerIpcHandlers } from './ipc/register'
import type { PortgateServices } from './ipc/register'
import { DB_FILE_NAME, openDatabase } from './db/connection'
import { createAdapter } from './platform/factory'
import { ProcessResolver } from './core/resolve/ProcessResolver'
import { ApplicationResolver } from './core/resolve/ApplicationResolver'
import { ProjectResolver } from './core/resolve/ProjectResolver'
import { DockerResolver } from './core/resolve/DockerResolver'
import { SecurityClassifier } from './core/security/SecurityClassifier'
import { KillPolicy } from './core/security/KillPolicy'
import { PortManager } from './core/port/PortManager'
import { PortScanner } from './core/port/PortScanner'
import { SessionStore } from './core/store/SessionStore'
import { SettingsStore } from './core/store/SettingsStore'
import { DEFAULT_SCAN_INTERVAL } from '../shared/constants'
import { IPC_CHANNEL_WHITELIST } from '../shared/ipc-contract'
import { runPhase2Probe, runPhase3Probe, runPhase4Probe, runPhase5Probe } from './dev/probe'
import { runUiCapture } from './dev/capture'
import { getWindowOptions } from './platform/window'
import type { PortEvent } from '../shared/types'

/** PORTGATE_SMOKE=1：dev 冒烟自动收口（验证完成即退出，供阶段门禁自动核验；不启动周期扫描，由探针手动驱动） */
const SMOKE_MODE = process.env.PORTGATE_SMOKE === '1'
/** PORTGATE_CAPTURE=1：dev 截图采集（方案 §10 / MINOR-UIR2-002：复用 SMOKE 的 env-gated 惯例，仅 dev 生效，采集完成自动收口） */
const CAPTURE_MODE = process.env.PORTGATE_CAPTURE === '1'
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function log(line: string): void {
  console.log(`[portgate] ${line}`)
}

/** 主进程 → renderer 事件广播（P 通道 port:events 的发送侧） */
function broadcastPortEvent(event: PortEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('port:events', event)
    }
  }
}

// ---- SQLite 持久化（阶段 5：D-1A 冒烟程序退役，connection.ts 接管；D-1 判据 B 见 tests/unit/sqlite-load.test.ts） ----
const db = openDatabase(join(app.getPath('userData'), DB_FILE_NAME))
const sessionStore = new SessionStore(db)
const settingsStore = new SettingsStore(db, {
  scanInterval: DEFAULT_SCAN_INTERVAL,
  theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' // R-07：首次默认跟随系统
})
log(`[db] ${DB_FILE_NAME} opened (WAL, schema v1)；设置已从库恢复（scanInterval=${settingsStore.get().scanInterval} theme=${settingsStore.get().theme}）`)

// ---- 扫描数据通路组装（方案 §10：PlatformAdapter → PortScanner → MemoryStore → Renderer） ----
const adapter = createAdapter()
const processResolver = new ProcessResolver()
const applicationResolver = new ApplicationResolver()
const projectResolver = new ProjectResolver()
const dockerResolver = new DockerResolver()
const classifier = new SecurityClassifier()
const portManager = new PortManager(
  adapter,
  processResolver,
  {
    application: (record) => applicationResolver.resolve(processResolver.getTree(record.pid)),
    project: (pid, cwd) => (cwd !== undefined ? projectResolver.resolve(pid, cwd) : undefined),
    docker: (localAddress, localPort) => dockerResolver.match(localAddress, localPort),
    classify: (input) => classifier.classify(input)
  },
  { sessionStore }
)
const killPolicy = new KillPolicy({
  findRecord: (recordId) => portManager.findRecord(recordId),
  getProcess: (pid) => adapter.getProcess(pid),
  terminateProcess: (pid, force) => adapter.terminateProcess(pid, force),
  classifier,
  // AC-09/AC-12 联动：DONE 后写 closed_at（幂等，PORT_CLOSED 事件重复收口自动跳过）并触发即时重扫
  onExitConfirmed: (recordId) => {
    sessionStore.close(recordId, Date.now())
    scanner.requestRefresh()
  }
})
const scanner = new PortScanner(portManager, (result) => {
  if (result.error !== null) {
    broadcastPortEvent({ type: 'SCAN_ERROR', payload: { message: result.error } })
    return
  }
  if (result.events.length > 0) {
    broadcastPortEvent({ type: 'DIFF', payload: { events: result.events } })
  }
  if (result.pushSnapshot) {
    broadcastPortEvent({
      type: 'SNAPSHOT',
      payload: { records: result.records, stats: result.stats }
    })
  }
})

const services: PortgateServices = {
  listSnapshot: (query = '') => portManager.listSnapshot(query),
  findRecord: (recordId) => portManager.findRecord(recordId),
  requestRefresh: () => scanner.requestRefresh(),
  applyScanInterval: (intervalMs) => scanner.updateInterval(intervalMs),
  terminate: (recordId) => killPolicy.terminate(recordId),
  forceTerminate: (recordId) => killPolicy.forceTerminate(recordId),
  getSettings: () => settingsStore.get(),
  persistSettings: (patch) => {
    settingsStore.update(patch)
  },
  history: (params) => sessionStore.queryHistory(params.query, params.limit)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'PortGate · 端口门禁',
    show: false,
    // §7.1：hiddenInset/交通灯定位经 platform/window.ts 注入（平台判定唯一合法区）；
    // 启动底色对齐新 token（暗 #252527 / 明 #ffffff），消除启动闪色与主题不符
    ...getWindowOptions(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#252527' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // capture 模式关闭背景节流：窗口被遮挡时仍持续出帧，防 capturePage 取到陈旧帧（§10.2 D-UI-C 加固）
      backgroundThrottling: !CAPTURE_MODE
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    log('[D-2] BrowserWindow ready-to-show，窗口已显示')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (!isDev) {
      return
    }
    // 截图采集与冒烟探针互斥：capture 模式自驱动九状态并自动收口
    if (CAPTURE_MODE) {
      if (mainWindow) {
        void runUiCapture({ window: mainWindow, portManager }).catch((error: unknown) => {
          log(`[CAPTURE] 采集失败 — ${error instanceof Error ? error.message : String(error)}`)
          app.quit()
        })
      }
      return
    }
    void verifyDevSmoke()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * dev 冒烟探针（仅 dev 执行）：经真实 preload 桥 + Pinia store 切换主题，
 * 核验 D-2 三要素（preload 桥可用 / 主题切换生效 / antd 组件在 CSP 下正常渲染）。
 */
async function verifyDevSmoke(): Promise<void> {
  if (!mainWindow) {
    return
  }
  const probeTimeout = setTimeout(() => {
    log('[D-2] renderer smoke 超时：FAIL')
    if (SMOKE_MODE) {
      app.quit()
    }
  }, 20000)

  const probe = `(() => new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const html = document.documentElement
        const themeBefore = html.dataset.theme || 'unset'
        // antd 渲染核验（v1.2 后 a-switch 已废除）：.ant-table（常驻）+ 点击设置入口验证
        // .ant-popover 浮层渲染，随后收起；语义不变（验证 antd 在 CSP 下正常渲染）
        const tableOk = Boolean(document.querySelector('.ant-table'))
        let popoverOk = false
        const settingsTrigger = document.querySelector('.pg-settings-trigger')
        if (settingsTrigger) {
          settingsTrigger.click()
          await new Promise((r) => setTimeout(r, 400))
          popoverOk = Boolean(document.querySelector('.ant-popover'))
          settingsTrigger.click()
          await new Promise((r) => setTimeout(r, 200))
        }
        const antdRendered = tableOk && popoverOk
        const bridge = window.portgate
        const smoke = window.__portgateDevSmoke
        if (!bridge || !smoke) {
          resolve({ ok: false, reason: 'preload 桥或 dev smoke 挂载点缺失' })
          return
        }
        const target = themeBefore === 'dark' ? 'light' : 'dark'
        const setOk = await smoke.settings.setTheme(target)
        const themeAfter = html.dataset.theme || 'unset'
        // 等 0.2s 背景过渡动画结束后再取样，确保读到切换后的真实背景色
        await new Promise((r) => setTimeout(r, 400))
        const bodyBg = getComputedStyle(document.body).backgroundColor
        await smoke.settings.setTheme(themeBefore === 'unset' ? 'light' : themeBefore)
        resolve({ ok: true, antdRendered, themeBefore, themeAfter, setOk, bodyBg })
      } catch (error) {
        resolve({ ok: false, reason: String(error) })
      }
    }, 800)
  }))()`

  try {
    const result = (await mainWindow.webContents.executeJavaScript(probe, true)) as {
      ok: boolean
      antdRendered?: boolean
      themeBefore?: string
      themeAfter?: string
      setOk?: boolean
      bodyBg?: string
      reason?: string
    }
    clearTimeout(probeTimeout)
    if (result.ok) {
      log(
        `[D-2] preload 桥可用；主题切换 ${result.themeBefore} -> ${result.themeAfter} ` +
          `${result.setOk ? '生效' : '未生效'}；antd 组件渲染 ${result.antdRendered ? '正常' : '异常'}；` +
          `body bg = ${result.bodyBg}`
      )
    } else {
      log(`[D-2] renderer smoke FAIL — ${result.reason ?? '未知原因'}`)
    }
  } catch (error) {
    clearTimeout(probeTimeout)
    log(`[D-2] renderer smoke 执行失败 — ${error instanceof Error ? error.message : String(error)}`)
  }
  // SMOKE 模式的退出由探针链收口（见 whenReady），此处不再提前退出
}

app.whenReady().then(() => {
  registerIpcHandlers(services)
  // 启动日志不变式（v1.4 MINOR-R5-001）：通道清单由 IPC_CHANNEL_WHITELIST 生成，
  // 与白名单恒等，通道增减自动跟随（契约测试断言此生成方式）
  log(`IPC 白名单通道注册完成（${IPC_CHANNEL_WHITELIST.join(' / ')}）`)

  if (isDev) {
    log('dev mode：D-1A 冒烟已由 SQLite 连接接管（D-1 判据 B 见 tests/unit/sqlite-load.test.ts）')
  }

  createWindow()

  if (SMOKE_MODE) {
    // 设置重启恢复验证（第二阶段：PORTGATE_SETTINGS_ONLY=1 只读设置即退出）
    if (process.env.PORTGATE_SETTINGS_ONLY === '1') {
      const restored = settingsStore.get()
      const ok = restored.scanInterval === 5000 && restored.theme === 'dark'
      log(`[SETTINGS_RESTORE] scanInterval=${restored.scanInterval} theme=${restored.theme} ok=${ok}`)
      app.exit(ok ? 0 : 1)
      return
    }
    // 阶段 2/3/4/5 真机核对 + 阶段 5 设置写入标记（重启恢复验证的第一阶段）
    void runPhase2Probe(portManager)
      .then(() => runPhase3Probe(portManager))
      .then(() => runPhase4Probe(portManager, killPolicy))
      .then(() => runPhase5Probe(portManager, sessionStore, settingsStore, killPolicy))
      .then(() => {
        if (process.env.PORTGATE_SETTINGS_WRITE === '1') {
          settingsStore.update({ scanInterval: 5000, theme: 'dark' })
          log(`[SETTINGS_WRITE] scanInterval=5000 theme=dark written for restart-restore check`)
        }
      })
      .catch((error: unknown) => {
        log(`[SMOKE] probe chain aborted — ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        setTimeout(() => app.quit(), 500)
      })
  } else {
    scanner.start()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  scanner.stop()
  app.quit()
})
