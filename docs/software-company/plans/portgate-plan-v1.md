# PortGate（端口门禁）V1.1 实施方案

- 方案版本：v1.2（v1.1 经第 2 轮全新审查 reviewer-r2 裁决 **APPROVE**（0 blocker / 0 major / 4 minor / 未决假设 0 / 证据缺口 0，见 §12），第 1 轮 9 项修订全部独立验证闭环；v1.2 仅按主理人指令将 reviewer-r2 的 minor_follow_up 清单 m-04~m-07 实现口径回写受影响小节，无需求/验收/用户可见行为/API/数据语义/范围变化）
- 状态：APPROVED（依据 reviewer-r2 第 2 轮裁决；v1.2 为 minor 回写版。若主理人或后续 reviewer 认定回写构成范围变化，重新进入审查 loop）
- 日期：2026-09-22
- 作者：架构师 高见远（software-architect）
- 路线：标准 / 增量（需求已 PRD_READY）
- 上游输入（唯一需求来源，本方案不新增需求）：
  - 需求文档：`docs/software-company/prd/portgate-requirements-v1.1.md`（V1.1，下文以 §N 引用其章节）
  - PM 就绪记录：`docs/software-company/prd/prd-ready-record-v1.md`（PRD_READY；AC-01~AC-16 可执行验收清单；解释性裁定 R-01~R-08；§4 V1 范围外清单）

---

## 1. 方案范围与验收标准映射

### 1.1 范围

覆盖需求 §27「V1 必做清单」全部条目，交付 6 个阶段（§7），每阶段一个提交点。明确不含：

- §28 明确不做项（抓包、防火墙、自动封禁、流量分析、云同步、远程、账号）。
- §29 后续版本项：V1.1 History Page / Port Timeline / Favorite Port / Ignore Rule / Custom Protection Rule / Menu Bar；V1.2 Win/Linux Adapter 完整实现、Docker 深度识别、端口冲突检测；V2 全部。
- §4.5 高级搜索语法；§6 明确不做 Last Active；§22 签名/公证（R-08）。
- Docker 深度识别（R-04：V1 仅 `docker ps` 端口映射尽力关联，非验收阻断项）。

### 1.2 AC 逐项映射

| AC | 内容摘要 | 方案落点 | 阶段 |
|---|---|---|---|
| AC-01 | 多关键词 AND 跨字段命中 | SearchEngine（§5.12），fixture 单测 | 3 |
| AC-02 | 命中高亮统一 HighlightText | highlight.ts + HighlightText.vue（§6/§5.12） | 3 |
| AC-03 | 搜索权重排序 | SearchEngine 评分表（§5.12），排序单测 | 3 |
| AC-04 | 真机端口关联十项信息完整 | MacAdapter + ProcessResolver + Drawer（§5.3/§5.6/§6）；**拆段验收（M-04）**：阶段 3 核对八项（Port/PID/Process/Command/Working Directory/Start Time/Uptime/Exposure）+ Application/Project 仅验字段位保留，阶段 4 Resolver 接入后十项终验 | 2/3/4 |
| AC-05 | ApplicationResolver 进程树解析 | §5.7，process-tree fixture 单测 | 4 |
| AC-06 | ProjectResolver marker 识别 | §5.8，临时目录 fixture 单测 | 4 |
| AC-07 | Exposure 判定 | exposure.ts（§5.15），单测 | 2 |
| AC-08 | KillPolicy 校验/拒绝矩阵 + 无 kill(pid) 通道 | §5.11 状态机单测 + IPC 白名单测试（§4.3/§8.3） | 4 |
| AC-09 | 真机用户进程 SIGTERM 闭环 | KillPolicy + SessionStore closed_at（§5.11/§5.14），真机 | 4/5 |
| AC-10 | 系统进程保护拒绝 | SecurityClassifier + KillPolicy DENY（§5.10/§5.11），真机+单测 | 4 |
| AC-11 | 强制结束兜底 SIGKILL | PENDING_FORCE 分支（§5.11），真机 | 4 |
| AC-12 | 历史会话写入与检索 | SessionStore + 历史 Tab（§5.14/§6），:memory: 单测 | 5 |
| AC-13 | 真机历史闭环 | 阶段 5 真机清单 | 5 |
| AC-14 | macOS .dmg 打包安装启动（含打包版 SQLite 读写正常，M-03 口径） | electron-builder + better-sqlite3 加载策略（§3.4），阶段 6 真机 | 6 |
| AC-15 | Win/Linux CI 产物 | GH Actions 矩阵（§7 阶段 6） | 6 |
| AC-16 | 平台逻辑架构隔离 | Adapter 工厂 + ESLint 边界 + 架构测试（§8.3） | 2（持续至 6） |

---

## 2. 项目现状与证据

### 2.1 仓库现状（已核验）

- `/Users/leiyu/code/github/PortGate`：git 仓库，分支 `feature-0922-v0.0.x`，提交 `d77d12c Initial commit`。
- 仅有：`README.md`、`LICENSE`、`.gitignore`、`docs/software-company/{prd,plans,review}`。**从零搭建，无既有代码约束。**
- 上游文档核验：`shasum -a 256 docs/software-company/prd/portgate-requirements-v1.1.md` = `2ee93772051e159204209d978a7ca456a17d9f8e59e2422c6f65cdaa7f531e3d`，与 PM 就绪记录一致。

### 2.2 环境证据（2026-09-22 本机实测）

| 项 | 证据 |
|---|---|
| OS | `sw_vers` → macOS 26.6.2 (25G83)，arm64；Xcode CLT 位于 `/Library/Developer/CommandLineTools`（node-gyp 回退编译可用） |
| Node 工具链 | node v22.22.2 / npm 10.9.7 / pnpm 11.15.1 |
| Docker | `/usr/local/bin/docker` 存在，`docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}'` 实测输出含 `0.0.0.0:15433->5432/tcp, [::]:15433->5432/tcp` 形态 |

### 2.3 命令证据（MacAdapter 设计依据，均为本机实测输出）

1. `lsof -nP -iTCP -sTCP:LISTEN -F0pcn`：输出为 NUL 分隔的带前缀字段行，`p<pid>`、`c<command>`、`n<地址:端口>`（如 `n127.0.0.1:14013`、`n*:64227`），并夹带未请求的 `f<fd>` 行——**解析器必须按行首字段前缀过滤，忽略未知前缀**。同一进程多条 `n` 行（多 socket）需按 `(pid,协议,地址,端口)` 去重。
2. `lsof -nP -iUDP -F0pcn`：存在 `n*:*`（未绑定端口）条目——**必须过滤端口为空的 UDP 条目**。
3. `ps -axo pid=,ppid=,uid=,user=,lstart=,%cpu=,%mem=,comm=`：`comm` 输出完整可执行路径（GUI 应用为 `/Applications/微信.app/Contents/MacOS/WeChat` 形态，是 ApplicationResolver 的启发式依据）；`lstart` 输出 C locale 格式 `Mon Sep 21 14:08:26 2026`。
4. `ps -o etimes=` 在 macOS **不支持**（实测 `ps: etimes: keyword not found`）——**进程启动时间只能解析 `lstart` 字符串（固定月份映射表）转 epoch**，此为 KillPolicy StartTime 校验的实现基础。
5. `ps -axo pid=,args=`：`args` 为完整命令行；长命令行需 `-ww` 防列宽截断。
6. `lsof -a -p <pid> -d cwd -Fn`：输出 `n/Users/leiyu/code/github/PortGate` 形态工作目录；`-p` 支持逗号分隔批量（多 PID 单次调用）。
7. `npm view` 版本证据（2026-09-22）：electron 44.4.3、electron-vite 5.0.0、vite 8.3.0、vue 3.5.43、pinia 4.0.3、ant-design-vue 4.2.6、better-sqlite3 13.0.3、electron-builder 26.15.3、vitest 5.0.1、typescript 最新 7.0.2（5.x 最新 5.9.3）、less 4.9.1、@electron/rebuild 4.2.0、vue-tsc 3.3.11、@vitejs/plugin-vue 6.0.9、eslint-plugin-vue 10.11.0、typescript-eslint 8.70.1。
8. `npm view electron-vite@5.0.0 peerDependencies` = `{ vite: '^5.0.0 || ^6.0.0 || ^7.0.0', '@swc/core': '^1.0.0' }`——**Vite 8 尚不被 electron-vite 5 支持，Vite 必须钉 ^7**。
9. `lsof -nP -iTCP -sTCP:LISTEN -iUDP -F0pcnPT` 实测（v1.1 复核，M-01 依据）：不带 `PT` 时输出仅含 `p`/`c`/`f`/`n` 前缀，**无任何协议与 TCP 状态字段**；追加后输出 `PTCP`/`PUDP` 协议字段与 `T` 连接信息（含 `TST=LISTEN`，夹带 `TQR=0`、`TQS=0` 噪声子字段）；UDP 条目无 `T` 字段。
10. `ps` 列行为实测（v1.1 复核，M-02 依据）：`comm=` 与 `args=` 同列时 comm 被截断为 16 字符（MAXCOMLEN，实测 `/usr/libexec/log` ← 实际 `/usr/libexec/logd`）；`comm=` 单独位于列尾时输出完整路径；`%mem` 与 `comm`、`comm` 与 `args` 列间可出现单空格；`lstart` 单数日期为空格填充（POSIX %e，如 `Sep  2`）。
11. `npm view better-sqlite3@13.0.3 scripts dependencies` 实测（v1.1 复核，M-03 依据）：**无 install/postinstall 脚本、无 prebuild-install 依赖**（仅 `node-addon-api` 与构建辅助脚本）；包内捆绑 N-API（NAPI_VERSION=10）各平台单一通用二进制（本机形态 `prebuilds/darwin-arm64.node`，经 `lib/darwin-arm64.js` 硬编码 require 加载），**运行时加载与 Node/Electron ABI 无关**。
12. `npm view vitest@5.0.1 peerDependencies` 实测：`vite ^6.4.0 || ^7.0.0 || ^8.0.0`（与 Vite 7 兼容）；`typescript-eslint@8.70.1` 声明支持 TS `<6.1.0`（不支持 TS 7.0.2，佐证钉 ~5.9.3）。

---

## 3. 技术选型定稿

### 3.1 选型表（严格遵循需求 §20）

| 依赖 | 版本 | 理由 |
|---|---|---|
| electron | `~44.4.3`（钉次版本） | 当前稳定大版本；钉 minor 降低大版本 API 漂移风险（§9 R-4） |
| electron-vite | `^5.0.0` | Vite 官方生态的 Electron 三端（main/preload/renderer）构建编排器，peer 要求 `vite ^5||^6||^7`（§2.3-8 证据）。备选方案为手写三份 vite 配置，收益低成本高，不采用 |
| vite | `^7.0.0` | 受 electron-vite peer 约束钉 7.x，**不用最新 8.x**（证据 §2.3-8） |
| vue | `^3.5.43` | 需求 §20 |
| pinia | `^4.0.3` | 需求 §20 |
| **Vue Router** | **不引入** | V1 为单视图 + Drawer，无路由需求；避免引入死依赖。§20 列出但主理人任务书注明「如需要」。**此为对既定栈的有意裁剪，交本轮 reviewer 审定** |
| ant-design-vue | `^4.2.6` | 4.x 为 Vue3 正式线 |
| less | `^4.9.1` | 需求 §20；主题变量（§6） |
| better-sqlite3 | `~13.0.3`（钉次版本） | 需求 §20 指定；v13 包内自带 N-API 通用预编译二进制，加载与 Electron ABI 无关、无重建环节（§2.3-11），策略见 §3.4 |
| electron-builder | `^26.15.3` | 需求 §21 |
| typescript | `~5.9.3` | **不用最新 7.0.2**：TS7（原生编译版）与 vue-tsc / electron-vite / antd 类型生态兼容性未经验证，且 typescript-eslint 8.70.1 仅支持 TS <6.1.0（§2.3-12），选 5.x 末版为低风险定稿 |
| vitest | `^5.0.1` | 单测框架；peer `vite ^6.4 || ^7 || ^8` 与 Vite 7 兼容（§2.3-12） |
| vue-tsc / @vitejs/plugin-vue | `^3.3.11` / `^6.0.9` | 类型检查 / SFC 编译 |
| @vue/test-utils / happy-dom | `^2.5.1` / `^20.14.5`（devDeps） | HighlightText 组件测试所需（第 1 轮 m-02） |
| eslint + eslint-plugin-vue + typescript-eslint | `^9` + `^10.11.0` + `^8.70.1` | flat config；承担 AC-16 架构边界规则 |

- 包管理器：**npm**（不用 pnpm/yarn）。理由：electron-builder 打包依赖与 native 模块（better-sqlite3 包内 `prebuilds/` 目录）在 pnpm 符号链接布局下存在已知摩擦，npm 平铺布局对 Electron 打包路径最稳。环境已具备（npm 10.9.7）。
- 其余运行时依赖目标为零新增（不引入 TOML 解析器、不引入 ORM；ProjectResolver 对 go.mod/pyproject.toml/pom.xml/settings.gradle/Cargo.toml 用受限正则提取，解析失败回退目录名，均被单测覆盖）。

### 3.2 进程模型

- Main：全部平台探测、Scan、Diff、Search、Resolver、Classifier、KillPolicy、SQLite（better-sqlite3 仅 main 加载）。
- Preload：`contextBridge.exposeInMainWorld('portgate', api)`，api 由 `shared/ipc-contract.ts` 类型约束。
- Renderer：Vue3 + Pinia + antd，只通过 `window.portgate` 访问数据。

### 3.3 Renderer 安全边界（需求 §18 / AC-08）

- `webPreferences`: `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`；加载本地 `dist/index.html`。
- IPC 白名单唯一注册点 `src/main/ipc/register.ts`；channel 常量集中在 `src/shared/ipc-contract.ts`。
- **不存在 kill(pid) 通道**：Renderer 只能 `port:terminate(recordId)` / `port:forceTerminate(recordId)`；终止前由 KillPolicy 在 main 内重读快照全量校验（§5.11）。
- `record:reveal(recordId, 'workdir'|'project')` 由 main 校验 recordId 存在且路径为该记录的 cwd/project path 后才 `shell.openPath`，不接受 Renderer 传任意路径。
- index.html 注入 CSP meta，完整指令集（v1.2 按 m-06 修订）：`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`——`style-src 'unsafe-inline'` 为必选项：ant-design-vue@4.2.6 运行时为 CSS-in-JS（实测其 dependencies 含 `@emotion/hash`、`@emotion/unitless`、`stylis`），注入内联 `<style>`，仅 `default-src 'self'` 会阻断样式渲染；dev 模式下 Vite HMR 走 WebSocket，需 `connect-src` 含 `ws:`，或采用「prod 构建才注入 CSP meta、dev 由 electron-vite 默认放宽」策略——二选一在阶段 1 定稿并记录于 ipc-contract 同级常量文件。**阶段 1 冒烟（dev 启动 + 主题切换）必须在 CSP 就位状态下通过。**

### 3.4 better-sqlite3 加载与打包策略（v1.1 按 M-03 重写）

机制事实（§2.3-11，已实测复核）：better-sqlite3@13 为 N-API（NAPI_VERSION=10）模块，npm 包内捆绑全部目标平台的单一通用二进制（本机形态 `prebuilds/darwin-arm64.node`，由 `lib/darwin-arm64.js` 硬编码 require 加载），**运行时加载与 Node/Electron ABI 无关；包内无 install/postinstall 脚本、无 prebuild-install 依赖**。据此：

1. **不存在 ABI 重建环节，不需要任何 rebuild 步骤**：v1.0 所述 `postinstall: electron-builder install-app-deps` 与 @electron/rebuild 对 v13 均无意义（install-app-deps 仅对含 install/gyp 安装脚本的旧式 native 依赖生效），已从方案中移除。
2. better-sqlite3 置于 `dependencies`（随应用打包）；main 构建经 `externalizeDepsPlugin` 外置不进 bundle；`electron-builder.yml` 设 `asarUnpack: ["**/*.node", "**/prebuilds/**", "node_modules/better-sqlite3/**"]`，保证包内预编译二进制在 asar 外可被 require。
3. 验证程序为执行期决策 D-1（§11）：双侧 smoke——判据 A（Electron 侧，阶段 1：electron-vite dev 下对 `:memory:` 库真实建表/插入/查询）、判据 B（vitest 侧，阶段 5 开工前：vitest 环境 load + 读写）；各失败分支的既定下一步见 §11 D-1。
4. 终级回退：Node 22 内建 `node:sqlite`。为使回退成本可控，阶段 5 首任务即将 SQLite 访问收敛于 `src/main/db/connection.ts` 单点（DB 适配接口，业务层不直接触 sqlite）；**启用该回退前必须先修订本方案**。
5. CI：无需交叉 rebuild，三平台 runner 直接使用包内对应平台预编译（electron-builder 打包 `dependencies` 原样带上）。

---

## 4. 工程结构

### 4.1 目录树（新建全部文件）

```text
PortGate/
├── package.json  package-lock.json
├── electron.vite.config.ts      # main/preload/renderer 三段配置
├── electron-builder.yml
├── tsconfig.json  tsconfig.node.json  tsconfig.web.json
├── eslint.config.js  vitest.config.ts
├── build/icon.png               # 512/1024 占位图标（R-08，正式图标后到再换）
├── .github/workflows/ci.yml     # 阶段 6 加入
├── src/
│   ├── main/
│   │   ├── index.ts             # app 生命周期、BrowserWindow、退出 flush
│   │   ├── ipc/register.ts      # IPC 白名单唯一注册点
│   │   ├── core/
│   │   │   ├── port/   PortManager.ts  PortScanner.ts  DiffEngine.ts  exposure.ts  recordId.ts
│   │   │   ├── search/ SearchEngine.ts  fields.ts  score.ts  highlight.ts
│   │   │   ├── resolve/ ProcessResolver.ts  ApplicationResolver.ts  ProjectResolver.ts  DockerResolver.ts  markers.ts
│   │   │   ├── security/ SecurityClassifier.ts  KillPolicy.ts
│   │   │   └── store/  MemoryStore.ts  SessionStore.ts  SettingsStore.ts
│   │   ├── platform/
│   │   │   ├── types.ts  factory.ts        # PlatformAdapter 接口 + process.platform 工厂（AC-16 平台分支唯一合法位置）
│   │   │   ├── mac/    MacAdapter.ts  lsofParser.ts  psParser.ts
│   │   │   ├── windows/ WindowsAdapter.ts  # 预留 stub（R-01）
│   │   │   └── linux/  LinuxAdapter.ts     # 预留 stub（R-01）
│   │   └── db/ connection.ts  migrations.ts
│   ├── preload/index.ts
│   ├── shared/  types.ts  ipc-contract.ts  constants.ts
│   └── renderer/
│       ├── index.html  main.ts  App.vue
│       ├── styles/  variables.less  themes.less  base.less
│       ├── stores/  ports.ts  search.ts  settings.ts  history.ts
│       └── components/  SearchBar.vue  StatsBar.vue  PortTable.vue  HighlightText.vue
│                        DetailDrawer.vue  HistoryList.vue  ThemeToggle.vue
└── tests/
    ├── fixtures/  lsof-scan.txt  ps-core.txt  ps-args.txt  lsof-cwd.txt
    │              ps-combined-truncation.txt  docker-ps.txt  process-tree.json  port-session-cases.json
    ├── unit/      （解析器/引擎/分类器/状态机/存储等 *.test.ts，见 §8.1）
    └── manual/    真机人工验证清单.md（QA 资产，范围见 §8.4）
```

### 4.2 IPC 清单（方向：R=renderer→main invoke，P=main→renderer push）

| Channel | 方向 | 入参 | 出参 | 依据 |
|---|---|---|---|---|
| `port:list` | R | `{ query? }` | `{ records: PortRecord[], stats: { total, tcp, udp, exposed } }`（仅当前快照；历史检索一律走 `port:history`，v1.2 m-05） | §18 |
| `port:detail` | R | `recordId` | `PortRecord \| null` | §18 |
| `port:history` | R | `{ query, limit? }` | `PortSession[]` | §18/§11 |
| `port:terminate` | R | `recordId` | `TerminateResult`（状态机终态+拒绝原因） | §18/§15 |
| `port:forceTerminate` | R | `recordId` | `TerminateResult` | §18/§17 |
| `port:refresh` | R | 无 | `{ ok }`（触发一次去抖立即扫描） | §18/§19 |
| `port:events` | P | — | `{ type: 'SNAPSHOT'\|'DIFF'\|'SCAN_ERROR', payload }` | §18/§19 |
| `settings:get` | R | 无 | `{ scanInterval, theme }` | §19 可配置 + §23 主题。**超出 §18 七项的扩展，交 reviewer 审定** |
| `settings:set` | R | `{ scanInterval?, theme? }` | `{ ok }`；scanInterval 仅接受 1000/2000/5000 | 同上 |
| `record:reveal` | R | `{ recordId, target: 'workdir'\|'project' }` | `{ ok }`（详情 Drawer「打开项目目录」） | §5 Drawer 草图按钮 |

「复制命令」用 renderer `navigator.clipboard`，不设 IPC。

契约约束（v1.2 m-05）：`ipc-contract.ts` 为每个 channel 注释**唯一职责**；契约测试断言「channel 职责互不重叠、入参字段均有消费方」（阶段 1 建立、阶段 5 接入 `port:history` 时复验）。历史 Tab 计数口径：「当前 N」取自 `port:list`，「历史 M」取自 `port:history` 返回条数。

### 4.3 安全边界断言（可测）

- 单测静态断言：`src/shared/ipc-contract.ts` 导出的 channel 集合恒等于上表白名单；`src/preload` 源码不出现 `child_process`/`fs`/`kill`；`window.portgate` 暴露方法名与白名单一一对应（支撑 AC-08 尾项）。

---

## 5. 核心模块设计

### 5.1 数据模型与 recordId

- `PortRecord/ProcessInfo/ApplicationInfo/ProjectInfo/ContainerInfo/TimingInfo/SecurityInfo/RuntimeInfo` 按需求 §8 原样定义于 `src/shared/types.ts`。
- `recordId = `${protocol}:${localAddress}:${localPort}:${pid}``（进程绑定身份）；Diff 分组 key = `${protocol}:${localAddress}:${localPort}`（端口身份，用于识别 PROCESS_CHANGED）。
- `timing.firstSeen/lastSeen` 由 PortManager 维护（内存），持久化时机见 §5.14。

### 5.2 PlatformAdapter 接口（`src/main/platform/types.ts`）

按需求 §13 原样：`scanPorts(): Promise<RawPort[]>`、`getProcess(pid)`、`getProcessTree(pid)`、`terminateProcess(pid, force?)`、`getApplicationInfo?(pid)`。工厂 `createAdapter()` 按 `process.platform` 分发——**全工程唯一 `process.platform` 合法位置**（AC-16）。

### 5.3 MacAdapter（v1.1 按 M-01/M-02 修订）

| 用途 | 命令 | 说明 |
|---|---|---|
| 端口扫描 | `lsof -nP -iTCP -sTCP:LISTEN -iUDP -F0pcnPT` | 单次调用覆盖 TCP LISTEN + UDP（§27 范围）；`P` 字段产出协议（`PTCP`/`PUDP`），`T` 子字段产出状态（`TST=LISTEN`）。§2.3-9 实测：不带 PT 时输出仅有 p/c/f/n 前缀，**无法产出 Protocol/State** |
| 进程核心表 | `ps -axo pid=,ppid=,uid=,user=,lstart=,%cpu=,%mem=,comm=` | `comm` 位于列尾时输出完整路径、不截断（§2.3-10）；供 PID/PPID 树、uid、user、启动时间、CPU/内存 |
| 进程命令行 | `ps -axww -o pid=,args=` | 独立调用取完整命令行；与 `comm=` 同列会导致 comm 被 MAXCOMLEN 截断为 16 字符（§2.3-10），故拆两次调用按 pid join |
| 工作目录 | `lsof -a -d cwd -Fn -p <pid1,pid2,...>` | 仅对监听记录涉及的新 PID 惰性批量解析（§5.6） |
| 终止 | `kill -TERM <pid>` / `kill -KILL <pid>`（Node `process.kill`） | 由 KillPolicy 调用，Renderer 不可达 |

- 所有 spawn 注入 `env: { ...process.env, LC_ALL: 'C', LANG: 'C' }`，消除 locale 差异；10s 超时；非零退出/超时→抛 AdapterError，PortScanner 保留上一快照（§5.4）。
- **lsofParser**（合并扫描单输出）：按 `\0` 切 token；`p` 开新进程组，`c` 更新命令名，`P` 给出该 socket 协议（`PTCP`/`PUDP`），`n` 给出 `地址:端口`，`T` 为连接信息串（按空格/逗号切子字段，**仅取 `TST=` 作 state；忽略 `TQR=`/`TQS=` 及一切未知 T 子字段**）；`f` 与未知前缀忽略；缺 `P` 的 socket 行丢弃并计入解析告警（防协议误判）；TCP 行 `TST≠LISTEN` 丢弃（命令已过滤，防御性）；UDP 无 `T`，state=null；地址 `*` 视为 wildcard（Exposure 归 Exposed，§5.15）；UDP `*:*`（无端口）丢弃；按 `(pid, protocol, addr, port)` 去重（protocol 取自 P 字段）。纯函数，fixture 驱动。
- **psParser**（两次调用分别解析，**位置锚定**，弃用 v1.0「≥2 空格定长切分」）：核心表按空白切 token——1=pid、2=ppid、3=uid、4=user、5..9=lstart（`Www Mmm d hh:mm:ss yyyy`，单数日期为空格填充但空白切分后仍为 5 token，固定月份映射转 epoch ms，证据 §2.3-4/-10）、10=%cpu、11=%mem，**其后剩余整段（保留内部空格、仅去尾部空白）= executablePath**；命令行表 token 1=pid、其余整段=commandLine（`-ww` 防截断）。两表按 pid join：executablePath 以核心表为准，命令行表缺失的 pid 其 commandLine 为空。纯函数，fixture 驱动。

### 5.4 PortScanner

- 循环用 `setTimeout` 链（防重入，不重叠），周期默认 2000ms，`settings` 仅允许 1000/2000/5000（§19）。
- 每轮流水线：`adapter.scanPorts()` → ps 全表 join（补 ProcessInfo）→ 新 PID 批量取 cwd → Resolver 增强（§5.7~5.9，均带缓存）→ DiffEngine 对比上一快照 → 事件出栈。
- `port:refresh` 触发立即扫描（500ms 去抖，扫描中则合并）。
- 失败语义：本轮失败保留上一快照并通过 `port:events` 推 `SCAN_ERROR`，连续失败在 UI 状态点呈现。

### 5.5 DiffEngine

- 输入 prev/next 两快照，按端口分组 key 对齐，产出四类事件（§19）：
  - `PORT_OPENED`：分组 key 新增 → SessionStore INSERT；
  - `PORT_CLOSED`：分组 key 消失 → session `closed_at` 收口；
  - `PORT_CHANGED`：同 key 同 pid，state/remote/address 变化；
  - `PROCESS_CHANGED`：同端口 key 的 pid/executable 变化 → 旧 session 收口 + 新 session INSERT。
- 事件载荷含变更字段，Renderer 按记录局部更新（§19 不整表刷新）。
- 纯函数：`(prev, next) => DiffEvent[]`，fixture 单测。

### 5.6 ProcessResolver

- 持有 ps 两调用 join 后的全量进程表（每轮随扫描刷新，§5.3），提供 `get(pid)`、`getTree(pid)`（沿 PPID 上溯，深度上限 32，ppid≤1 止）。
- cwd 缓存 `Map<pid, path>`：仅对「当前监听记录涉及且未缓存」的 PID 批量调用 lsof（§5.3）；pid 不在下一轮 ps 全表时清缓存。

### 5.7 ApplicationResolver

- 从目标 pid 沿 PPID 上溯，命中 executablePath 匹配 `/**/*.app/Contents/MacOS/**` 或 `/**/*.app/Contents/**` 即返回：`name` = `.app` 目录去后缀（本机证据：`/Applications/微信.app/Contents/MacOS/WeChat`，§2.3-3），`path` = `.app` 目录，`bundleId` 尽力读取 `Contents/Info.plist` 中 `CFBundleIdentifier`（受限正则，失败为空，R-03）。
- 上溯至 ppid≤1 / 深度上限未命中 → `application` 为空（R-03：字段位保留）。
- 进程自身即 GUI app（如 Chrome）时直接返回自身。fixture：`process-tree.json`（node→npm→zsh→login→iTerm2）。

### 5.8 ProjectResolver

- 输入 cwd，向上逐级查找 marker（按优先级）：`package.json`、`pnpm-workspace.yaml`、`yarn.lock`、`pom.xml`、`build.gradle`、`settings.gradle`、`Cargo.toml`、`go.mod`、`pyproject.toml`、`requirements.txt`、`.git`（§9.2 清单）。
- 上溯边界：越过 `$HOME` 即停（避免把 /Users 下层误判为项目）。
- 名称提取顺序（就近 marker）：package.json `name` → settings.gradle `rootProject.name` → pom.xml `artifactId` → Cargo.toml `[package] name` → go.mod module 末段 → pyproject.toml `name` → 目录名兜底；`type` 按 marker 类型映射，`marker` 记录命中文件名。均受限正则 + 单测覆盖（AC-06）。
- 结果按 `(pid, cwd)` 缓存，cwd 变化即失效。

### 5.9 DockerResolver（R-04 尽力而为）

- `docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}'`（本机实测格式 §2.2）；解析 `Ports` 中 `<hostIP>:<hostPort>-><containerPort>/<proto>` 多段。
- 匹配：记录的 localPort==hostPort 且 localAddress 为 wildcard/0.0.0.0/[::]/hostIP → 填 `container { name, image }`。
- 节流 10s 刷新 + docker 不存在/daemon 不可达时静默跳过（不产生扫描失败）。深识别（container 内进程等）不在 V1。

### 5.10 SecurityClassifier

输出 `USER | SYSTEM | SYSTEM_CRITICAL | UNKNOWN`（§16）。**判定不依赖进程名**，按序规则（命中即返回，全部单测覆盖）：

1. `pid <= 1` → SYSTEM_CRITICAL；
2. executablePath 前缀 `/System/` 或 `/usr/libexec/` → SYSTEM_CRITICAL（§16 高风险路径）；
3. executablePath 前缀 `/usr/sbin/`、`/usr/bin/`、`/sbin/`、`/private/var/db/` → SYSTEM；
4. `user` 匹配 `^_`（macOS 服务账户，如实测 `_*` 账户运行的用户态守护）→ SYSTEM；
5. `uid === 0` 且 executablePath 不在用户域 → SYSTEM；
6. executablePath 在用户域（`/Users/<home>/**`、`/Applications/**`、`/opt/homebrew/**`、`/usr/local/**`）且 `uid === 当前 uid` → USER；
7. 其余（无路径、外置卷、身份缺失等）→ UNKNOWN。

用户域前缀常量收敛于 `constants.ts`，V1.1 自定义保护规则（protection_rule）时在此扩展。

### 5.11 KillPolicy（状态机，需求 §15/§17）

```text
IDLE → VALIDATING
VALIDATING:
  s1 按 recordId 取 MemoryStore 当前快照（不存在 → DENIED:RECORD_GONE）
  s2 adapter.getProcess(snapshot.pid) 重读（进程已死 → DONE:ALREADY_EXITED）
  s3 startTime 校验：重读 lstart epoch == 快照（不等 → DENIED:PID_REUSE）
  s4 executable 校验：路径一致（不等 → DENIED:PID_REUSE）
  s5 用重读数据重算 SecurityClassifier
     USER → EXECUTING；SYSTEM/SYSTEM_CRITICAL/UNKNOWN → DENIED:PROTECTED(level)
EXECUTING: SIGTERM（adapter.terminateProcess(pid,false)）
AWAITING_EXIT: 轮询 200ms，宽限 3s
  退出 → DONE → SessionStore closed_at 收口 → 触发即时重扫
  超时 → PENDING_FORCE（回传 Renderer，用户决定是否强制）
FORCE_EXECUTING: 再次完整 VALIDATING(s1~s5) → SIGKILL → DONE/DENIED
任意步系统错误 → FAILED(err)（如 EPERM）
```

- Renderer 全程只见 recordId 与终态/拒绝原因；「System Protected」等文案由 UI 按拒绝原因映射（AC-10）。
- 状态机以注入的 fake adapter + fake clock 做全分支单测（AC-08，含 PID 复用两例）。

### 5.12 SearchEngine（§4，AC-01/02/03）

- 可检索字段 = 需求 §4.2 全部 **18 项**（v1.2 按 m-04 修正计数并逐字段固化）。采用审查者建议：以 `src/main/core/search/fields.ts` 单一常量表穷举「字段名 → PortRecord 取值路径 → 分值档位」，**架构测试断言该表覆盖需求 §4.2 全集（无遗漏、无多余）**。逐字段映射：Port→localPort；Protocol→protocol；State→state；Local Address→localAddress；Remote Address→remoteAddress；PID→pid；PPID→ppid；Process Name→process.name；Executable Path→executablePath；Command Line→commandLine；User→user；Application Name→application.name；Project Name→project.name；Project Path→project.path；Working Directory→workingDirectory；Container Name→container.name；Docker Image→container.image；Protection Level→security.level。映射为纯文本值数组（数值字段同时供精确匹配），任何字段命中均产出高亮区间。
- 查询分词：`trim().split(/\s+/)` 小写化；空查询 → 全部记录按端口升序。
- AND 语义：每个关键词至少命中任一字段，记录才保留（跨字段分布命中，AC-01）。
- 关键词得分 = 其所有命中字段分值的最大值；记录总分 = 各关键词得分之和。分值档位（§4.3）：
  - Port/PID 数字精确 = 100；Process Name/Application Name/Project Name 精确 = 80；上述三名称包含 = 60；Command Line/Executable Path/Project Path/Working Directory/Container Name/Docker Image 包含 = 30；**默认档 = 10：上列未覆盖的字段（Protocol、State、Local Address、Remote Address、PPID、User、Protection Level）命中时计 10 分——仅参与 AND 命中与高亮，不承担排序权重（v1.2 m-04）**。
- 输出：`{ record, score, highlights: Map<field, [start,end][]> }`（每字段按关键词定位全部大小写不敏感区间）；排序 score desc，同分 port asc。纯函数全分支单测。
- 历史检索（§11/AC-12）：`port:history` 先 SQL LIKE（各关键词 AND，跨拼接字段列）预筛最近 1000 条 closed 会话，再过同一 SearchEngine 评分排序——当前/历史共用同一套搜索与高亮逻辑（R-02：V1 仅做搜索结果内「当前 N / 历史 M」Tab 切换，无独立历史页）。

### 5.13 Exposure（§7，AC-07）

`localAddress ∈ {127.0.0.1, ::1}` → Local；`∈ {0.0.0.0, ::, *}`（lsof wildcard）→ Exposed；统计条 Exposed 计数同源。纯函数 + 单测；UI 文案 `Local 仅本机 / Exposed 对外监听`，并带「对外监听 ≠ 公网可达」提示（§7 注意事项）。

### 5.14 SQLite 持久化（§10）

- 文件：`app.getPath('userData')/portgate.db`；`journal_mode=WAL`；`migrations.ts` 版本表管理 schema。
- V1 仅建两表：`port_session`（**DDL 逐字采用需求 §10.2**）与 `app_settings(key TEXT PRIMARY KEY, value TEXT)`。**裁量（R-06）**：不预建 favorite_port/ignore_rule/protection_rule——对应功能属 V1.1，届时以 migration 增加，避免投机 schema。
- 写入时机（§10.1 只在状态变化时写）：四类 Diff 事件分别 INSERT / 收口 closed_at / UPDATE state / 旧收口+新 INSERT；`last_seen_at` 内存维护，**以 60s 节流批量 UPDATE 仍未关闭会话（单事务）**，应用退出 flush——兼顾 §6「Last Seen=最近一次确认存在」与「不逐轮写库」原则。AC-09 判据（closed_at 正确、last_seen 停更）不受影响。
- SessionStore 接口：`open/changed/processChanged/close/batchTouch/query(keyword[])/find(recordId)`；测试用 `:memory:`（AC-12）。

### 5.15 Runtime 字段（R-05 可选增强）

ps 全表已含 `%cpu/%mem`，Drawer Runtime 区直接展示；不入 AC，无额外采集成本。

---

## 6. UI 设计落点（§3/§5/§23/§24）

- 布局：顶部 `PortGate · 端口门禁` + 监控状态点（绿=正常/红=扫描失败）→ 44px/9px 圆角搜索框（左 icon 右 `⌘K`，全局快捷键聚焦，placeholder 按 §24）→ 统计条 `N Ports · TCP x · UDP y · Exposed z` → `当前 N | 历史 M` Tab → antd Table（列 PORT/PROCESS/APP/PROJECT/ADDRESS/UPTIME/ACTION，PORT 列 Protocol 徽标 + Exposure Tag）→ 行点击开右侧 480px Drawer（Network/Process/Time/Runtime 分区按 §5，底部「打开项目目录」「复制命令」「结束进程」，保护级进程「结束进程」禁用并显示 System Protected）。
- **双主题（§23）**：`styles/variables.less` 以 Less 变量定义 Cloud Slate / Midnight Slate 两套色板，构建期生成 CSS custom properties（`:root` 与 `[data-theme='dark']` 两作用域）；antd 经 `ConfigProvider :theme` 切换 `darkAlgorithm/defaultAlgorithm` + token（colorBgBase/colorTextBase/colorPrimary 等映射同一色板源）。Pinia settingsStore 持久化 `theme`，**手动切换、首次默认跟随系统 `prefers-color-scheme`（R-07）**；禁用纯黑（Background #17191D）。
- **HighlightText**（AC-02）：`props { text, ranges }`，区间外包 `<mark>`；全应用唯一高亮实现，各列禁止自行拼高亮（架构测试断言仅此组件使用 mark/highlight 类）。
- 终止交互：结束进程弹确认框（含进程名/端口）；PENDING_FORCE 时升级为「进程未响应 SIGTERM，是否强制结束？」；拒绝时 message 提示保护级。
- Uptime/Port Duration 在 Renderer 每分钟重算展示（数据源 firstSeen/startedAt），字段语义严格按 §6（Last Seen ≠ Last Active）。
- Win/Linux 平台降级提示（R-01）：Adapter factory 返回 stub 时首页显示「当前平台完整功能将在后续版本提供」横幅。

---

## 7. 分阶段实施计划

> 每阶段一个提交点，由主理人在「阶段完成 + QA 验证」后用 smart-commit 提交；回滚 = `git revert <该阶段提交>`。阶段 1→2→3→4→5→6 存在上游依赖：revert 上游阶段必须连带 revert 其下游阶段提交。

### 阶段 1：工程脚手架 + 安全骨架 + 双主题壳 + 占位图标

- 影响文件：package.json、package-lock.json、electron.vite.config.ts、tsconfig*、eslint.config.js、vitest.config.ts（声明 happy-dom 测试环境，m-02）、build/icon.png、src/shared/{types,ipc-contract,constants}.ts、src/main/index.ts、src/main/ipc/register.ts（挂 settings:get/set，**不设任何占位通道**，m-01）、src/preload/index.ts、src/renderer/**（App 壳、双主题变量、ThemeToggle）、tests/unit/ipc-whitelist.test.ts（阶段 1 即断言白名单恒等，m-01）。
- 步骤：`npm init` 手工装配（不用交互式脚手架）→ 依赖按 §3.1 安装（含 better-sqlite3，执行 D-1 判据 A 读写 smoke，§11）→ 三段构建配置 → 窗口（安全 webPreferences）+ preload 桥 → 双主题切换壳（阶段冒烟 = dev 启动 + 主题切换，m-01）→ ESLint 边界规则就位。
- 测试/验证：vitest 白名单测试过（v1.2 m-05：断言 channel 集合恒等 + `ipc-contract.ts` 每 channel 含唯一职责注释 + 职责互不重叠、入参字段均有消费方）；**CSP 就位状态下** `npm run dev` 真机启动（即 D-2 判据，§11）、主题切换生效（v1.2 m-06，含 antd 样式正常渲染）；`npm run typecheck`、`npm run lint` 过；**better-sqlite3 包内 N-API 预编译在 Electron 下读写 smoke 通过（D-1 判据 A）**。
- AC 映射：AC-16（骨架）、R-07/R-08；D-1 判据 A、D-2 判据闭环。
- 回滚：revert 本阶段提交 → 回到 Initial commit。

### 阶段 2：平台数据通路（Adapter/Scanner/Diff/IPC）

- 影响文件：src/main/platform/**（types/factory/mac/*、win/linux stub）、src/main/core/port/**、src/main/core/resolve/ProcessResolver.ts、src/main/ipc/register.ts（挂 port:list/refresh/events）、src/shared/ipc-contract.ts 扩展、tests/fixtures/{lsof-scan,ps-core,ps-args,ps-combined-truncation,lsof-cwd}.txt、tests/unit/{lsof,ps,exposure,diff,process-resolver}*.test.ts。
- 步骤：PlatformAdapter 接口+工厂 → lsof/ps 解析器（fixture 驱动：lsof-scan.txt 为 `-F0pcnPT` 合并输出真实样例、含 T 子字段噪声；ps-combined-truncation.txt 作为 16 字符截断回归证据——证明为何拆两次调用，M-01/M-02）→ MacAdapter 组装（ps 两调用按 pid join）→ PortScanner 流水线 → DiffEngine → MemoryStore → IPC 三通道 → Renderer 接 `port:events` 局部更新（此时可用极简列表验证）。
- 测试/验证：解析器/Exposure/Diff 单测绿（含：协议归属自 `PTCP/PUDP`、`TQR/TQS` 容错、单空格列界、单数日期空格填充 lstart、含空格路径、UDP `*:*` 丢弃）；真机起 `python3 -m http.server 18080`（或 node server），dev 模式下列表 2s 内出现该端口、杀进程后 PORT_CLOSED 事件可见；扫描周期切 1/2/5s 生效；**核对项（M-01 关闭判据）：同一端口 TCP/UDP 协议徽标与 stats `{total,tcp,udp,exposed}` 分列与 `lsof -F0pcnPT` 实际输出逐条一致**。
- AC 映射：AC-07、AC-16（平台隔离成型）、AC-04 数据底座。
- 回滚：revert 本阶段提交（Renderer 退回主题壳）。

### 阶段 3：首页列表 + 统一搜索 + 高亮 + 详情 Drawer

- 影响文件：src/main/core/search/**、src/main/ipc/register.ts（port:list 支持查询）、src/renderer/components/{SearchBar,StatsBar,PortTable,HighlightText,DetailDrawer}.vue、src/renderer/stores/{ports,search}.ts、tests/unit/{search-engine,highlight}*.test.ts。
- 步骤：字段映射 + 评分 + AND + 高亮区间（SearchEngine）→ SearchBar（⌘K）+ StatsBar → PortTable + HighlightText → Drawer 十项字段 + 打开目录/复制命令（record:reveal）。
- 测试/验证：AC-01/02/03 全分支单测（`5173 node buddy` fixture、`3000` 权重用例；v1.2 m-04：**至少一个默认档字段（如 User/Protocol/State）的命中用例**，且**架构测试断言 `fields.ts` 常量表覆盖需求 §4.2 全部 18 字段**）；真机核对 **AC-04 拆段第一段（M-04）：八项 Port/PID/Process/Command/Working Directory/Start Time/Uptime/Exposure 与 `lsof`/`ps` 一致**（node server 进程），Application/Project 仅验「字段位保留」（Resolver 阶段 4 才接入，R-03）；**带空格/长路径应用的 Command 与 Executable 与 ps 两调用输出一致（M-02 真机判据）**。
- AC 映射：AC-01、AC-02、AC-03、AC-04。
- 回滚：revert 后退回阶段 2 极简列表。

### 阶段 4：Resolver + 安全分类 + 安全结束闭环

- 影响文件：src/main/core/resolve/{ApplicationResolver,ProjectResolver,DockerResolver,markers}.ts、src/main/core/security/**、src/main/core/port/PortManager.ts（集成增强）、src/main/ipc/register.ts（port:terminate/forceTerminate、record:reveal 完善）、src/renderer/components/{DetailDrawer,PortTable}.vue（Action/保护徽标/确认与强制弹窗）、tests/fixtures/{process-tree.json,docker-ps.txt}、tests/unit/{app-resolver,project-resolver,docker-resolver,security-classifier,kill-policy}*.test.ts。
- 步骤：Application/Project/Docker Resolver 接入扫描流水线（缓存）→ SecurityClassifier → KillPolicy 状态机 → IPC 终止双通道 → UI 确认/拒绝/强制流程。
- 测试/验证：AC-05/06/08 单测全绿（PID 复用两例、四保护级矩阵、白名单复验）；真机：**Resolver 接入后 AC-04 十项终验（M-04 第二段）**；**AC-05 真机抽查：node→npm→zsh→iTerm2 实树应用识别正确（M-02 附带判据）**；AC-09（SIGTERM 起停 node server，端口消失）AC-10（对 `/usr/sbin/` 下系统进程尝试结束被拒且进程存活）AC-11（起一个 trap 忽略 TERM 的进程走强制流程）。
- AC 映射：AC-05、AC-06、AC-08、AC-09（UI 侧）、AC-10、AC-11。
- 回滚：revert 后终止通道不可达（列表/搜索/详情保留）。

### 阶段 5：SQLite 持久化 + 历史 + 设置

- 影响文件：src/main/db/**、src/main/core/store/{SessionStore,SettingsStore}.ts、src/main/core/port/{PortScanner,PortManager}.ts（Diff 事件接线）、src/main/index.ts（退出 flush）、src/main/ipc/register.ts（port:history、settings 落库）、src/renderer/components/HistoryList.vue、stores/{history,settings}.ts、tests/fixtures/port-session-cases.json、tests/unit/{session-store,history-search}*.test.ts。
- 步骤：**开工前置判据：D-1 判据 B（vitest 侧 better-sqlite3 加载 smoke，§11）通过** → connection + migrations（port_session/app_settings，SQLite 访问自首任务起收敛于 connection.ts 单点，§3.4-4）→ 四类事件写入 + 60s 批量 touch + 退出 flush → port:history（LIKE 预筛+同引擎评分）→ 历史 Tab + 时长格式（`17:30 - 18:42 · 1h12m`）→ 扫描周期/主题持久化。
- 测试/验证：:memory: 单测覆盖 open/close/changed/processChanged/批量 touch/查询（AC-12）；真机 AC-13（起停端口后历史 Tab 可搜、时间区间正确）；重启应用设置保留；IPC 契约复验（`port:history` 职责唯一、入参均有消费方，v1.2 m-05）。
- AC 映射：AC-12、AC-13、AC-09（closed_at 收口闭环完成）。
- 回滚：revert 后退回纯内存模式（无历史 Tab）。

### 阶段 6：双主题完善 + 打包 + CI + Win/Linux Adapter 预留

- 影响文件：src/main/platform/{windows/linux}/WindowsAdapter.ts 等 stub、src/main/platform/factory.ts（降级分支）、electron-builder.yml、build/icon.png（占位复核）、.github/workflows/ci.yml、src/renderer（降级横幅、主题细节打磨）、README.md（构建说明更新——最小幅度的既有文件修改）、tests/unit/adapter-factory.test.ts。
- 步骤：electron-builder 配置（appId com.portgate.app；mac dmg / win nsis / linux AppImage+deb；**mac 段显式 `identity: null`，CI/本地辅以 `CSC_IDENTITY_AUTO_DISCOVERY=false`，固定未签名口径（R-7/R-8），杜绝证书存在时被自动签名——v1.2 m-07**；asarUnpack 按 §3.4）→ 本地 `npm run dist` 出 **dmg 并安装启动（AC-14：扫描 + SQLite 历史读写正常，验证包内 N-API 预编译加载成功——M-03 口径；未签名 dmg 用右键打开/`xattr -cr` 说明写入 README）** → Win/Linux stub Adapter + 降级提示（R-01）→ CI 矩阵三平台（npm ci → lint → typecheck → test → build → electron-builder --publish never → upload-artifact）→ **条件任务（ICON-ARRIVAL，§11 D-3 / m-03）：正式图标到达后替换 build/icon.png（electron-builder 多尺寸导出）并重出 dmg 验证 Dock/Finder 图标显示**。
- 测试/验证：dmg 安装启动真机验证（AC-14）；push 后 Actions 三平台产物齐（AC-15：Setup.exe/AppImage/deb 各一份，仅验产物可产出）；AC-16 架构测试终验（含 m-04 fields.ts 覆盖断言）；**未签名口径复核（v1.2 m-07）：有/无证书两种机器状态下均可复现产出未签名 dmg（无 codesign 痕迹、可按 README 说明打开）**。
- AC 映射：AC-14、AC-15、AC-16、R-01/R-08。
- 回滚：revert 后 dev 模式仍全功能（打包/CI 为增量）。

---

## 8. 测试策略

### 8.1 自动化（vitest，fixture 驱动，不依赖真实系统进程）

| 域 | 用例要点 | AC |
|---|---|---|
| lsof/ps 解析器 | lsof-scan.txt 合并样例（`PTCP/PUDP` 协议归属、`TST=` 提取、`TQR/TQS` 噪声容错、缺 P 行丢弃告警、`f` 行、UDP `*:*` 丢弃、多 socket 去重）；ps-core.txt / ps-args.txt（单数日期空格填充 lstart、含空格路径、单空格列界、-ww 长命令行）；ps-combined-truncation.txt 截断回归证据（M-01/M-02） | AC-04 底座 |
| Exposure | 127.0.0.1/::1/0.0.0.0/::/* 五例 + 统计计数 | AC-07 |
| DiffEngine | OPENED/CLOSED/CHANGED/PROCESS_CHANGED + 同轮混合 | §19 |
| SearchEngine | AND 跨字段、负向排除、权重排序、空查询、大小写、多命中区间 | AC-01/03 |
| HighlightText | 分段计算、关键词全覆盖、无重叠（@vue/test-utils + happy-dom 组件测试，m-02） | AC-02 |
| ApplicationResolver | process-tree.json 上溯、bundleId 提取、ppid=1 终止 | AC-05 |
| ProjectResolver | 临时目录多 marker 层级、名称提取各类型、越 HOME 止、无 marker 空 | AC-06 |
| DockerResolver | docker-ps fixture 端口映射匹配、daemon 失败静默 | R-04 |
| SecurityClassifier | §5.10 七规则全矩阵 + 「不只看进程名」反例（同名 node 在 /usr/bin 与用户域） | AC-08/10 |
| KillPolicy | fake adapter+clock 全状态机：USER 放行/三拒绝级/PID 复用两例/超时转 PENDING_FORCE/二次校验/DONE 收口 | AC-08/09/11 |
| SessionStore | :memory: 写入/收口/批量 touch/关键词查询/时长字段 | AC-12 |
| IPC 白名单 + 安全边界 | channel 集合恒等、preload 无危险 API、HighlightText 唯一性 | AC-08/02/16 |
| 架构守护 | 业务层源码扫描：禁 `child_process`/`netstat`/`lsof` 字样；`process.platform` 仅存在于 platform/ 目录 | AC-16 |

### 8.2 真机人工验证清单（[人工/打包验证] 项，QA 执行）

AC-04（阶段 3 八项核对；阶段 4 Resolver 接入后十项终验，M-04）、AC-05 真机实树抽查（阶段 4）、AC-09（SIGTERM 闭环+session 收口）、AC-10（系统进程拒绝+UNKNOWN 默认禁）、AC-11（忽略 TERM 进程强制流程）、AC-13（历史闭环）、AC-14（dmg 安装启动+打包版 SQLite 读写正常/包内 N-API 预编译加载成功口径，M-03）；另含冒烟：⌘K 聚焦、主题切换持久化、扫描周期切换、未签名 dmg 打开方式。

### 8.3 失败判据

任一单测失败、typecheck/lint 失败、阶段验证步骤不复现 → 阶段不通过，不得提交该阶段提交点。

### 8.4 QA 资产范围

QA 新增/修改文件仅限：`tests/unit/**`（补充用例）、`tests/fixtures/**`（补充样例）、`tests/manual/真机人工验证清单.md`。超出该范围（如修改 src 实现）需先回到本方案修订。

---

## 9. 风险与回滚

| # | 风险 | 概率/影响 | 缓解 | 回滚 |
|---|---|---|---|---|
| R-1 | better-sqlite3 包内 N-API 预编译在 Electron 运行时加载异常 | 低/低（v1.1 按 M-03 重评） | v13 为包内 N-API 通用二进制，加载与 Electron ABI 无关、无重建环节（§2.3-11）；asarUnpack 覆盖 `**/prebuilds/**`（§3.4-2）；双侧 smoke 判据（D-1）；connection.ts 单点抽象可整体切换 node:sqlite 回退（§3.4-4） | 阶段 5 前不依赖 DB，可先行 |
| R-2 | lsof 输出差异（macOS 版本/本地化） | 低/中 | `-F0` 机器格式 + `LC_ALL=C` 强制 + 按前缀 token 容错解析 + fixture 回归；扫描失败保留上一快照不崩 | 单阶段 revert |
| R-3 | lsof 权限：其他用户进程信息受限 | 确定/低 | **V1 明确仅当前用户进程信息完整**；他人/系统端口可见但字段尽力、一律标 SYSTEM/UNKNOWN 拒绝终止（与 AC-10 口径一致），文档声明 | 不适用（产品口径） |
| R-4 | Electron 大版本 API 漂移 | 低/中 | electron 钉 `~44.4.3`；升级属方案修订 | package.json revert |
| R-5 | PID 复用误杀 | 低/高 | KillPolicy startTime+executable 双校验 + 重算保护级 + recordId 维度 IPC（§5.11） | 状态机单测兜底 |
| R-6 | 扫描性能（lsof 全量 + ps 全表每 1~2s） | 低/中 | 单次调用、Resolver 缓存、UDP `*:*` 过滤；1s 档真机实测 CPU，超预期默认回 2s | 设置可调 |
| R-7 | 未签名 dmg 被 Gatekeeper 拦 | 确定/低 | R-08 明确 V1 不签名；README 提供右键打开/xattr 说明 | 不适用 |
| R-8 | 阶段间 revert 连带 | 低/低 | §7 已标注依赖链，revert 上游须连带下游 | git 历史 |

观测方式：dev 模式 main 进程结构化日志（扫描耗时/事件数/DB 写入）；`port:events` 的 SCAN_ERROR 上报 UI 状态点。

---

## 10. 行为 / API / 数据语义变化说明

- 全新项目：全部为新增，无存量行为变更、无数据迁移。
- 语义口径固定（遵循 PM 裁定）：R-01（Win/Linux 产物可产出、功能降级）、R-02（V1 无独立历史页）、R-03（App/Project 尽力识别、字段位保留）、R-04（Docker 尽力）、R-05（Runtime 可选不入 AC）、R-06（不预建 V1.1 表，本方案裁量结果见 §5.14）、R-07（手动切换默认跟随系统）、R-08（占位图标、不签名）。
- 明确不修改：`README.md`（仅阶段 6 追加构建说明）、`LICENSE`、`.gitignore`、`docs/software-company/prd/**`（上游产物只读）。

---

## 11. 执行期决策程序（v1.1 按第 1 轮 A-1/E-1 裁定重构，原「未决假设与证据缺口」节）

本节不再以「悬而未决的假设/证据缺口」表述。重构为**全分支覆盖的执行期决策程序**：每一程序对全部可能结果均预先定义有证据、可执行的既定下一步（含钉版决策点、降级链、PAUSED 逃生口），使方案的正确性不依赖「某组合可用」这一未验证假设为真。此重构是否成立、计数是否归零，由下一轮全新 reviewer 独立裁定。

### D-1 better-sqlite3 加载验证程序（原证据缺口 E-1）

事实基础（§2.3-11/-12，已实测复核）：better-sqlite3@13 包内捆绑 N-API（NAPI_VERSION=10）各平台通用二进制，加载与 Electron ABI 无关、无重建环节。

- 判据 A（Electron 侧，阶段 1）：electron-vite dev 下对 `:memory:` 库真实建表/插入/查询成功。
- 判据 B（vitest 侧，阶段 5 开工前）：vitest 环境 load better-sqlite3 并完成一次读写。
- 分支表：
  - A、B 均通过 → 程序关闭，无遗留动作；
  - A 失败 → 先按 §3.4-2 检查 asarUnpack/加载路径并修复复测；仍失败 → 启用 node:sqlite 回退（connection.ts 单点替换，§3.4-4），此时返回 `PAUSED_USER_INPUT` 请主理人裁决（回退本身需先修订本方案）；
  - B 失败（A 通过）→ 不阻断运行时，仅阻断阶段 5 开工：排查 vitest 环境后复测，仍失败按上一分支处理。
- 打包级确认并入 AC-14：「打包版 SQLite 历史读写正常（包内 N-API 预编译加载成功）」。

### D-2 Electron 工程组合验证程序（原未决假设 A-1）

事实基础（§2.3-8/-12）：electron-vite@5 peer `vite ^5||^6||^7`；vitest@5.0.1 peer `vite ^6.4||^7||^8`——Vite 7 为两组件共同支持区间。

- 判据（阶段 1）：`npm run dev` 真机启动、preload 桥 IPC 可用、主题切换生效。
- 分支表：
  - 通过 → **钉版决策点**：定稿 electron `~44.4.3` + electron-vite `^5.0.0` + vite `^7`（并钉当时最新次版本），记入 §3.1；
  - dev 启动失败 → 按构建器 peer/启动诊断处理（含将 vite 钉至 7.x 具体次版本）后复测；仍失败 → 降级同为受支持区间的组合 **electron-vite ^4 + vite ^6**，修订 §3.1 后重试；
  - 降级后仍失败 → `PAUSED_USER_INPUT`，交主理人裁决构建编排替代方案。
- 任一分支均有既定路径，方案不因「组合可用与否」而失效；版本定稿以判据通过为准。

### D-3 正式图标到达时点跟踪（ICON-ARRIVAL，第 1 轮 m-03）

R-08 已确认：应用图标先用占位图，正式图标由外部流程约 3 小时后交付再集成。跟踪项：**主理人在阶段 6 开工前裁决图标插入时点**。阶段 6 已含条件任务：正式图标到达后替换 `build/icon.png`（1024 源图，electron-builder 多尺寸导出）并重出 dmg 验证 Dock/Finder 图标显示。图标未到达不阻塞阶段 1~5（占位图先行）与阶段 6 主体（打包/CI），仅该条件任务待触发。

### 计数结论

按上述重构：**未决假设 0 项、证据缺口 0 项**（原 A-1/E-1 已转化为带全分支既定动作的 D-1/D-2，ICON-ARRIVAL 为外部交付跟踪项而非方案不确定性）。该计数口径变更连同重构本身，提交下一轮全新 reviewer 裁定。

---

## 12. 审查处置表

| 轮次 | 结论 | blocker | major | minor | 处置 |
|---|---|---|---|---|---|
| 初稿 | PLAN_READY_FOR_REVIEW | 0（待审） | 0（待审） | 0（待审） | 提交独立 reviewer 对抗审查 |
| 第 1 轮 | REVISE（0 blocker / 4 major / 3 minor / 未决假设 1 / 证据缺口 1） | 0 | 4 | 3 | **M-01 接受**：扫描命令改 `lsof -F0pcnPT`，lsofParser 增 P/T 子字段规格（取 TST、忽略 TQR/TQS/未知），fixture 改合并样例+噪声容错用例，阶段 2 增协议徽标/stats 核对项（§2.3-9、§5.3、§7 阶段 2、§8.1）。**M-02 接受**：ps 拆两调用按 pid join（comm 列尾完整路径 + args 独立取命令行），psParser 改位置锚定弃用 ≥2 空格切分，fixture 增截断/单空格/单数日期样例，阶段 3 增 Command/Executable 核对、阶段 4 增 AC-05 实树抽查（§2.3-10、§5.3、§7 阶段 2/3/4、§8.1）。**M-03 接受**：§3.4 按「v13 包内 N-API 通用二进制、无 install 脚本、无 prebuild-install」机制重写，移除 postinstall install-app-deps 与 @electron/rebuild，E-1 改述为加载验证（D-1 双侧判据），R-1 重评低/低，AC-14 改口径（§2.3-11、§3.4、§9 R-1、§11 D-1、§7 阶段 1/5/6、§1.2 AC-14、§8.2）。**M-04 接受**：AC-04 拆段——阶段 3 八项+字段位保留，阶段 4 十项终验；§1.2/§7/§8.2 三处一致修订。**m-01/m-02/m-03 接受**：删 port:ping 占位并阶段 1 即断言白名单恒等；§3.1 增 @vue/test-utils + happy-dom（vitest.config 声明 happy-dom）；§11 增 D-3（ICON-ARRIVAL）+ 阶段 6 条件任务。**A-1/E-1 重构**：转为 §11 执行期决策程序 D-1/D-2（全分支既定动作 + 钉版决策点 + PAUSED 逃生口），计数口径变更（未决假设 0 / 证据缺口 0）交下一轮全新 reviewer 独立裁定。修订后状态仍为 PLAN_READY_FOR_REVIEW |
| 第 2 轮（reviewer-r2，全新实例） | **APPROVE**（0 blocker / 0 major / 4 minor / 未决假设 0 / 证据缺口 0；第 1 轮 9 项修订全部经独立验证闭环） | 0 | 0 | 4 | minor 留存 reviewer 的 minor_follow_up_list_v1，不阻断批准。按主理人指令升版 **v1.2** 仅回写实现口径：**m-04**：§5.12 字段计数 17→18、逐字段映射、默认档 10 分规则、fields.ts 单一常量表 + 架构断言覆盖 §4.2 全集、阶段 3 增默认档字段命中用例；**m-05**：§4.2 port:list 删 tab 参数（历史一律走 port:history）、ipc-contract 每 channel 唯一职责注释、契约测试断言职责互不重叠/入参均有消费方（阶段 1 建立、阶段 5 复验）、历史 Tab 计数口径；**m-06**：§3.3 CSP 完整指令集（style-src 'unsafe-inline' 适配 antd 4 CSS-in-JS——已实测 dependencies 含 @emotion/hash/@emotion/unitless/stylis；dev 下 connect-src 含 ws: 或 prod 才注入 CSP）+ 阶段 1 CSP 就位冒烟；**m-07**：阶段 6 mac 段显式 identity: null + CSC_IDENTITY_AUTO_DISCOVERY=false + 有/无证书双状态复核未签名 dmg。v1.2 未改变任何需求/验收/行为/API/数据语义/范围；若认定构成范围变化，重新进入审查 loop |

需 reviewer 重点裁定的设计裁量：① 不引入 Vue Router（§3.1）；② IPC 在 §18 七项之上扩展 settings:get/set 与 record:reveal（§4.2）；③ V1 不预建 favorite/ignore/protection 表（§5.14，R-06 授权裁量）；④ last_seen_at 60s 节流批量写入与 §10.1「只变化时写」原则的兼容口径（§5.14）；⑤ recordId 复合键与 Diff 分组 key 的双层定义（§5.1）。
