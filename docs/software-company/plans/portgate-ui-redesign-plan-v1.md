# PortGate（端口门禁）UI 按 Apple 设计风格重构——实施方案

- 方案版本：**v1.1**（v1.0 初稿经第 1 轮全新独立审查 ui-reviewer-r1 裁决 REVISE（0 blocker / 2 major / 5 minor / 未决假设 0 / 证据缺口 0）；v1.1 按 M-01/M-02/m-01~m-05 逐项修订，处置见 §14）
- 状态：**PLAN_READY_FOR_REVIEW**（修订后仍为待审状态，交下一轮全新 reviewer）
- 日期：2026-09-23
- 作者：架构师 高见远（software-architect）
- 路线：增量（视觉与交互层重构，需求已 REQUIREMENTS_READY）
- 上游输入（唯一需求来源，本方案不新增需求）：
  - 需求记录：`docs/software-company/prd/portgate-ui-redesign-requirements-v1.md`（REQUIREMENTS_READY，下文以 §N 引用；含 25 条 UI-AC、§4 token 基准值、§5 十七项裁定、§8 D-UI-01~09、§9 R-UI-1~5）
  - 现状问题盘点：`docs/software-company/prd/ui-defect-inventory-v1.md`（17 项 P0/P1/P2，全部纳入）
  - 视觉规范：`/Users/leiyu/code/github/awesome-design-md/design-md/apple/DESIGN.md`（version: alpha，2026-09-23 检索；下文以 DESIGN.md §键名引用其 YAML token）
  - V1 功能基线：`docs/software-company/plans/portgate-plan-v1.md`（v1.4，APPROVED；§3.3 CSP、§4.2 IPC 白名单、§5.12 搜索与 fields.ts、§6 UI 落点）
- 硬约束（来自主理人任务书与需求 §3.2/§10，全程有效）：
  1. 功能零回退：AC-01~AC-16 复验通过，既有 185 条单测全绿（2026-09-23 实测，§3.2 证据 E-9）；
  2. IPC 契约 / 数据语义 / 安全边界零变更（`src/shared/ipc-contract.ts`、SQLite schema、KillPolicy、SearchEngine、`src/main/core/search/fields.ts` 一律不动）；
  3. HighlightText 全应用唯一高亮实现（`<mark>` 唯一性架构断言 `tests/unit/arch-boundary.test.ts:87-92` 保持通过）；
  4. CSP 不放宽（`src/shared/constants.ts:44-46` 原样）；
  5. 无新增运行时依赖（含不引入 Inter 字体包，DESIGN.md 替代指引以 system-ui 栈满足）；
  6. 双主题完整（明暗各一张完整 token 表）；不引入 Vue Router。

---

## 1. 目标、需求与验收标准映射

### 1.1 目标

以 Apple 设计语言（DESIGN.md alpha）为唯一视觉规范，对 PortGate 做数据工具密度适配后全量落地：色板、字形、圆角、层次、密度、控件语法、文案七类系统性替换，消除盘点 17 项问题；暗色主题为第一观感达标项。

### 1.2 UI-AC 逐项映射

| UI-AC | 内容摘要 | 方案落点 | 阶段 | 验证方式 |
|---|---|---|---|---|
| 01 | 明色 token 全集 + 无旧色残留 | §4.1 明色表；§4.7 旧值扫描 | A | 自动化 + 截图 |
| 02 | 暗色 token 全集（第一观感达标） | §4.1 暗色表（暗色 hairline 派生 token 过 §4.6 对比度断言） | A | 自动化 + 截图（暗色先行） |
| 03 | 色彩语义唯一性走查 | §4.2 语义三层规则 + §4.1 派生裁定 5（高亮蓝豁免登记） | A/B | 截图 |
| 04 | 圆角五档静态断言 | §4.3 档位分配表 + §9 阶段 B 断言（圆角字面量扫描随组件迁移激活） | B | 自动化 |
| 05 | 字体栈/字重/字号断言 | §4.5 排版定档 + 断言 | A | 自动化 |
| 06 | tabular-nums | §4.5 `.pg-num` + 断言 | A/B | 自动化 + 截图 |
| 07 | 零装饰阴影 + 至多一处功能阴影 | §4.1 `--pg-shadow-overlay` 显式 token + box-shadow 扫描规则 | A | 自动化 |
| 08 | 主题切换/持久化不受影响 | 主题存储键值/桥调用零变更（§11.3）；图标化开关仅换皮 | B/C | 人工 + 既有 settings 套件复跑 |
| 09 | token 对比度计算 | §4.6 全对计算表（测试内实现相对亮度公式） | A | 自动化 + 截图 |
| 10 | 行高 44–60px（目标 48）、单行化、可视行数 ≥2× | §5.4 表格密度定档；源码常量推算断言 + 截图复核（happy-dom 无布局引擎，自动化口径见 §9 阶段 B） | B/C | 自动化（组件度量口径）+ 截图 |
| 11 | PORT 列单行三要素 | §5.4 端口单元格规格 | B | 截图 |
| 12 | ADDRESS 不断词 + tooltip + `→` | §5.4 地址单元格（nowrap+ellipsis+tooltip）；抽屉完整地址 | B/C | 自动化（样式断言）+ 人工 |
| 13 | 无 PROJECT 空列、行内次要文本、命中高亮联动 | §6 PROJECT 并入方案 + app-shell 组件断言 | B | 自动化（组件测试）+ 截图 |
| 14 | 仅 1px hairline 行分隔 | §5.4 行分隔规格（去斑马纹/外框） | B | 截图 + 源码断言 |
| 15 | 列宽分布（无死空间/无横滚） | §5.4 列宽策略 + §10.2 双档窗口采集（1280 主档 / 2560 表格承载态 6 张） | C | 截图 |
| 16 | 搜索框 pill/44px/⌘K 键帽 5px | §5.6 搜索框规格 | B | 自动化 + 人工（⌘K） |
| 17 | 按钮三级语法 + 按压/焦点微交互 | §5.5 按钮语法 + 断言 | B | 自动化（样式断言）+ 截图 |
| 18 | 保护进程禁用态 + 可见原因 | §5.5 禁用态规格（行内 tooltip + Drawer 行内常显） | B/C | 人工 + 截图 |
| 19 | Tab 选中交互蓝、无残影、user-select:none | §5.3 分段控件 + 断言 | B | 自动化 + 截图 |
| 20 | Drawer 18px/hairline/scrim/分区完整 | §5.7 Drawer 重塑 | B/C | 截图 + 人工 |
| 21 | 页眉唯一标题/拖拽/交通灯/图标化 | §7 hiddenInset 实现细节 | C | 人工 + 截图 |
| 22 | 文案规范化全走查 | §8 文案常量表单一来源 + 断言 | A/B | 自动化 + 截图 |
| 23 | 统计条层级/琥珀唯一条件 | §5.2 统计条规格 | B | 截图 |
| 24 | 基线功能无回退（AC-01~16） | §9 阶段 C 人工抽查 + 185 套件 | C | 自动化 + 人工 |
| 25 | 双主题全界面截图集比对 | §10 截图验收方案（18+6=24 张：9 状态×双主题含确认/强制弹窗与设置 popover，另 2560 档 6 张；暗色先行） | C | 截图 |

---

## 2. 项目现状与证据

### 2.1 仓库与基线事实（2026-09-23 本机核验）

- 分支 `feature-0922-v0.0.x`，HEAD `6e0d645`；V1 已按 `portgate-plan-v1.md`（v1.4，APPROVED）交付。
- **证据 E-9**：`npm test` 实测输出 `Test Files 22 passed (22) / Tests 185 passed (185)`（911ms），全绿基线成立。

### 2.2 现 UI 代码事实（绝对路径:行号）

| 事实 | 证据 | 关联问题 |
|---|---|---|
| 列头全大写英文、PROJECT 独立列 | `src/renderer/App.vue:100-109`（PORT/PROCESS/APP/PROJECT/ADDRESS/UPTIME/ACTION） | #8、#4 |
| 统计条英文标签、Exposed 恒琥珀 | `App.vue:45-50`、`App.vue:190-199`（`--pg-warning` 无条件作用于 Exposed 项） | #8、#15、#6 |
| 状态/协议色滥用：TCP=蓝、UDP=绿描边徽标 | `App.vue:222-238`、`App.vue:438-446` | #6 |
| 行内「结束」恒红描边（红按钮墙） | `App.vue:295-302`（`danger` 无条件） | #1 |
| 禁用态无可见原因（仅 tooltip 英文） | `App.vue:284-294`；`DetailDrawer.vue:286-297` | #10 |
| `· PID` / `· LISTEN` 中点混用 | `App.vue:245`、`App.vue:275-278` | #9 |
| ADDRESS 列可换行、抽屉 `word-break: break-all` | `App.vue:269-279`（无 nowrap）；`DetailDrawer.vue:361` | #3 |
| 搜索框 9px 圆角（档外）、键帽 5px | `SearchBar.vue:100`、`SearchBar.vue:145` | #13 |
| 抽屉内嵌块 8px、大写英文分区标题 + 正字距 | `DetailDrawer.vue:322`、`DetailDrawer.vue:329-334` | #13、#8 |
| 主题开关 = switch + 英文主题名常驻 | `ThemeToggle.vue:10-28`（Midnight Slate/Cloud Slate） | #16、#12 |
| 保护拒绝提示用 warning（琥珀挪用） | `composables/terminate.ts:38`（`message.warning`） | #6 |
| 旧色板（Cloud/Midnight Slate） | `styles/variables.less:5-29`、`styles/themes.less:5-33`、`theme.ts:22-53`（互为镜像双维护） | §4.1 替换对象 |
| 字体栈缺 `system-ui`、无 tabular/焦点环/按压态 | `styles/base.less:16-29` | §4.2/§4.3 |
| 窗口无 titleBarStyle、启动底色为旧色 | `src/main/index.ts:110-125`（`:117` backgroundColor `#17191D`/`#F6F7F9`） | #7 |
| 高亮 mark：accent 文字 + accent 18% 底 + 2px 圆角 | `HighlightText.vue:77-85` | §4.1 派生裁定 5 豁免登记 |
| 时长格式 `5m12s`（秒为零不省略） | `src/renderer/utils/format.ts:8-21` | #17 |

### 2.3 架构与测试护栏事实（重构必须保持的断言）

| 护栏 | 证据 | 对本方案的含义 |
|---|---|---|
| `<mark>` 仅存在于 HighlightText.vue | `tests/unit/arch-boundary.test.ts:87-92` | 任何高亮观感调整只改该组件样式，不新增 mark |
| fields.ts 覆盖 18 字段（无遗漏/无多余） | `tests/unit/search-engine.test.ts:56-58`；`src/main/core/search/fields.ts:59-78` | §6 论证渲染位置迁移不触碰该表 |
| IPC 白名单/契约断言 | `tests/unit/ipc-whitelist.test.ts`、`ipc-contract.test.ts` | 不新增/修改 channel（设置入口复用 `settings:set` 既存 `scanInterval` 参数） |
| 业务层禁平台命令/`process.platform` 仅限 platform/ | `tests/unit/arch-boundary.test.ts:41-74` | hiddenInset 平台分支必须落在 `src/main/platform/`（§7.1） |
| antd 4.2.6 token 能力 | `node_modules/ant-design-vue/es/theme/interface/alias.d.ts:26-28`（colorLink/colorLinkHover）、`maps/colors.d.ts:70/233/320`（colorBgElevated/colorWarningText/colorErrorText）、`maps/style.d.ts:24/32`（borderRadiusSM/borderRadiusLG） | §4.8 ConfigProvider 映射表全部键位受支持 |
| 测试对旧色板零依赖 | 全 tests/ 目录 grep `THEME_PALETTES|variables.less|4F6EF7|17191D` 零命中 | token 重写不破坏既有断言 |
| scanInterval 无既有 UI 入口 | `src/renderer/` 全目录 grep 仅 `stores/settings.ts:13/20/32` | §5.2 设置入口为「既存能力的首次界面化」，登记为范围解释（§11.4） |

---

## 3. 影响范围

### 3.1 拟修改/新增文件（全量清单）

**修改（renderer）**
- `src/renderer/styles/variables.less`——重写：DESIGN.md 键名对齐的双主题 Less 变量全集 + 派生 token（radius/spacing/shadow/scrim/highlight/禁用）
- `src/renderer/styles/themes.less`——重写：`:root` 与 `[data-theme='dark']` 双作用域 CSS custom properties
- `src/renderer/styles/base.less`——重写：字体栈、13px 基准、`.pg-num`、全局 `:focus-visible` 焦点环、`.pg-press` 按压态、antd 焦点阴影中和与浮层 radius 兜底
- `src/renderer/theme.ts`——重写：token 的 JS 镜像（供 ConfigProvider），`applyThemeToDocument` 原样保留
- `src/renderer/App.vue`——页眉/统计条/分段 Tab/表格列与单元格/空态/横幅中性化/ConfigProvider token 块
- `src/renderer/components/SearchBar.vue`——pill 化、焦点环、键帽 5px（行为与 ⌘K 逻辑零改动）
- `src/renderer/components/DetailDrawer.vue`——18px 面板/11px 内嵌块/中文标签/按钮语法/scrim/shadow/`→`
- `src/renderer/components/ThemeToggle.vue`——图标化 + tooltip「浅色/深色」（store 调用不变）
- `src/renderer/components/HighlightText.vue`——仅样式（mark 底色 token 化、文字改 ink、圆角 5px）；分段渲染逻辑零改动
- `src/renderer/composables/terminate.ts`——文案入表、`message.warning`→`message.error`（琥珀语义守卫）；终止流程逻辑零改动
- `src/renderer/utils/format.ts`——时长秒位为零省略
- `src/renderer/stores/settings.ts`——新增 `setScanInterval` action（调既有 `window.portgate.setSettings({ scanInterval })`，零契约变更）
- `src/main/index.ts`——BrowserWindow 选项接入 `getWindowOptions()`、backgroundColor 更新为新 token 值；其余逻辑零改动
- `src/shared/constants.ts`——新增 `TITLEBAR_MODE` 常量（R-UI-2 回退开关）；CSP 等既有常量原样
- `package.json`——`scripts` 新增 `capture` 一条；依赖零变更
- `.gitignore`——追加 `screenshots/`（截图产物不入库；理由：验收走查读本地文件，仓库不留机器相关产物）

**新增**
- `src/renderer/copy.ts`——文案常量表 + 列定义 + 分隔符常量（§8，单一来源）
- `src/renderer/components/SettingsMenu.vue`——页眉设置入口 popover（扫描周期三档，复用 settings:set）
- `src/main/platform/window.ts`——`getWindowOptions()`（hiddenInset/交通灯定位；`process.platform` 合法区）
- `src/main/dev/capture.ts`——PORTGATE_CAPTURE 截图脚本（§10）
- `tests/unit/design-tokens.test.ts`——token 契约断言（对比度计算/圆角/字重/阴影/旧值扫描/字体栈/负字距）
- `tests/unit/copy-contract.test.ts`——文案表断言 + 模板块旧形态扫描
- `tests/unit/format-duration.test.ts`——时长格式用例
- `tests/unit/app-shell.test.ts`——App 挂载组件断言（桥 mock：列头/PROJECT 并入高亮/空态/行高常量）

**明确不修改（防蔓延）**
- `src/main/core/**`（含 `search/fields.ts`、SearchEngine、KillPolicy、SecurityClassifier）、`src/main/db/**`、`src/main/ipc/**`、`src/main/platform/**` 既有文件、`src/preload/**`、`src/shared/{types,ipc-contract}.ts`
- `electron.vite.config.ts`（less additionalData 注入路径 `src/renderer/styles/variables.less` 不变，天然接住重写后的变量表）
- CSP（`src/shared/constants.ts:44-46`）、`docs/software-company/prd/**`、应用图标（§11 ICON-ARRIVAL 另行流程）、打包配置、CI

### 3.2 调用链与集成点

- 渲染链：`stores/ports.ts`（matches 高亮区间）→ App.vue 单元格 → HighlightText（唯一 mark）。本方案仅改「渲染位置与样式」，数据链路零改动。
- 窗口链：`main/index.ts createWindow()` → `platform/window.ts getWindowOptions()`（新增只读注入，无 IPC）。
- 设置链：SettingsMenu.vue → `stores/settings.ts` → `window.portgate.setSettings`（既有 `settings:set` 通道，参数校验 1000/2000/5000 在 main 侧不变）。

---

## 4. 设计 token 体系落地（§4.1~§4.3 需求授权的架构师定档全记录）

### 4.1 色板全集（明/暗两套，Less 变量名与 DESIGN.md YAML 键对齐）

Less 源变量（`variables.less`，供构建期注入）→ CSS custom properties（`themes.less`，稳定语义名供组件消费）→ JS 镜像（`theme.ts`，供 antd）三处同源，断言三处值恒等（§9 阶段 A）。

**明色（浅色）**

| Less 变量（DESIGN.md 键） | CSS 变量 | 值 | 用途 | 关键对比度（§4.6 断言） |
|---|---|---|---|---|
| `@light-bg`（=colors.canvas） | `--pg-bg` | `#ffffff` | 窗口底色/body（明色与 canvas 同值） | — |
| `@light-canvas`（colors.canvas） | `--pg-canvas` | `#ffffff`（需求固定） | 主工作区/表格/抽屉 | — |
| `@light-canvas-parchment`（colors.canvas-parchment） | `--pg-surface` | `#f5f5f7`（需求固定） | 页眉/统计条带、行 hover、抽屉内嵌块 | — |
| `@light-ink`（colors.ink） | `--pg-text` | `#1d1d1f`（需求固定） | 全部正文与标题 | 对 canvas 16.83 / 对 surface 15.46 |
| `@light-body-muted`（colors.body-muted） | `--pg-muted` | `#6e6e73`（需求固定） | 次要文本/占位符/表头 | 对 canvas 5.10 / 对 surface 4.68 |
| `@light-hairline`（colors.hairline） | `--pg-hairline` | `#e0e0e0`（需求固定） | 全部 1px 分隔与描边 | 对 canvas 1.32 / 对 surface 1.21（≥1.2 可辨下限） |
| `@light-primary`（colors.primary） | `--pg-accent`、`--pg-accent-fill` | `#0066cc`（需求固定） | 交互文字/选中/焦点根；明色下文字档=填充档同值 | 文字对 canvas 5.57；白字对填充 5.57 |
| （派生）`@light-primary-hover` | `--pg-accent-hover` | `#0059b3` | hover 加深一档 | 白字对填充 6.82 |
| `@light-primary-focus`（colors.primary-focus） | `--pg-focus` | `#0071e3`（需求固定） | 2px 焦点环 | 对 canvas 4.70（非文本 ≥3 ✓） |
| （派生）`@light-danger-text` | `--pg-danger-text` | `#D70015` | 危险文字/描边（对齐 Apple 系统红暗色变体） | 对 canvas 5.38 / 对 surface 4.95 |
| （派生）`@light-danger-fill` | `--pg-danger-fill` | `#D70015` | 确认弹窗红色主按钮填充 | 白字对填充 5.38 |
| （派生）`@light-warning` | `--pg-warning` | `#B45309` | 琥珀（仅 Exposed 文字/标签） | 对 canvas 5.02 / 对 surface 4.61 |
| （派生）`@light-success` | `--pg-success` | `#1E8E5A` | 监控状态点（唯一含义） | 对 surface 3.80 / 对 canvas 4.14（非文本 ≥3 ✓） |
| （派生）`@light-disabled` | `--pg-disabled` | `#7a7a7a`（DESIGN.md ink-muted-48） | 禁用控件文字 | 对 canvas 4.29（≥3 ✓） |
| （派生）`--pg-highlight-bg` | rgba(0,102,204,0.16) | 搜索高亮底（mark） | ink 文字于其上 ≈13:1 |
| （派生）`--pg-scrim` | rgba(0,0,0,0.32) | 浮层遮罩 | — |
| （派生）`--pg-shadow-overlay` | `0 12px 40px rgba(0,0,0,0.16)` | 唯一功能性阴影（浮层） | 显式定义（UI-AC-07） |
| `@light-elevated`（=colors.canvas） | `--pg-elevated` | `#ffffff` | 弹窗/popover 浮层面（明色与 canvas 同值） | — |

三处同源断言覆盖上表全部行（含 `--pg-bg`/`--pg-elevated` 两别名行，v1.1 按 m-02 补入）。

**暗色（深色，第一观感达标项）**

| Less 变量（DESIGN.md 键） | CSS 变量 | 值 | 用途 | 关键对比度 |
|---|---|---|---|---|
| `@dark-surface-tile-3`（colors.surface-tile-3） | `--pg-bg` | `#252527`（需求固定） | 窗口底色/body | — |
| `@dark-surface-tile-1`（colors.surface-tile-1） | `--pg-canvas` | `#272729`（需求固定） | 表格/卡片/抽屉主表面 | — |
| `@dark-surface-tile-2`（colors.surface-tile-2） | `--pg-surface` | `#2a2a2c`（需求固定） | 条带/hover 面/浮层次级 | — |
| `@dark-body-on-dark`（colors.body-on-dark） | `--pg-text` | `#ffffff`（需求固定） | 正文与标题 | 对 #272729 14.92 / 对 #2a2a2c 14.32 |
| `@dark-body-muted`（colors.body-muted） | `--pg-muted` | `#cccccc`（需求固定） | 次要文本/占位符/表头 | 9.29 / 8.92 |
| （派生）`@dark-hairline` | `--pg-hairline` | `rgba(255,255,255,0.14)` | 分隔线（自 tile 系白色低透明阶派生，需求授权） | 混合于 #272729 ≈1.56 / #252527 ≈1.55 / #2a2a2c ≈1.50（均 ≥1.2） |
| `@dark-primary-on-dark`（colors.primary-on-dark） | `--pg-accent` | `#2997ff`（需求固定） | 暗面交互**文字**档（链接/选中/Tab 选中） | 对 #272729 4.95 / #2a2a2c 4.75 |
| （派生）`@dark-primary-fill` | `--pg-accent-fill` | `#0071e3` | 暗面按钮**填充**档 | 白字对填充 4.70（见下方派生裁定 1） |
| （派生）hover | `--pg-accent-hover` / `--pg-accent-fill-hover` | `#55aaff` / `#0069c9` | hover 派生 | 均保持各自档达标 |
| （派生）`@dark-primary-focus` | `--pg-focus` | `#409cff` | 焦点环（需求授权在 #2997ff 基础上定） | 对 #272729 5.27；与 #2997ff 元素可区分 |
| （派生）`@dark-danger-text` | `--pg-danger-text` | `#FF6961` | 危险文字/描边（Apple 暗面无障碍红） | 对 #272729 5.29 / #2a2a2c 5.08 |
| `@dark-danger-fill` | `--pg-danger-fill` | `#D70015`（与明色恒值） | 确认弹窗红主钮填充 | 白字 5.38 |
| （派生）`@dark-warning` | `--pg-warning` | `#FF9F0A` | 琥珀（仅 Exposed） | 对 #272729 7.26 / #2a2a2c 6.97 |
| （派生）`@dark-success` | `--pg-success` | `#30D158` | 监控状态点 | 对 #272729 7.38（≥3 ✓） |
| （派生）`@dark-disabled` | `--pg-disabled` | `#808082` | 禁用文字 | 对 #272729 3.78（≥3 ✓） |
| （派生）`--pg-highlight-bg` | rgba(41,151,255,0.22) | 高亮底 | 白字于其上 ≈11.5:1 |
| （派生）`--pg-scrim` | rgba(0,0,0,0.5) | 浮层遮罩 | — |
| （派生）`--pg-shadow-overlay` | `0 12px 40px rgba(0,0,0,0.5)` | 唯一功能阴影 | 显式定义 |
| （派生）`--pg-elevated` | `#2a2a2c`（明色为 `#ffffff`） | 弹窗/popover 浮层面 | — |

**派生裁定（架构师定档依据，交 reviewer 审定）**

1. **暗面按钮填充档取 `#0071e3` 而非 `#2997ff`**：白字对 #2997ff 仅 3.01:1，不达 UI-AC-09 的 4.5:1（13px 按钮标签非大字）；白字对 #0071e3 = 4.70:1 达标，且与 apple.com 暗面购买按钮实际做法一致。#2997ff 仍为需求固定的交互文字档（UI-AC-02 断言值存在）。
2. **危险红放弃沿用 `#E5484D`**：白字对 #E5484D = 3.91:1 不达 4.5:1；文字/填充两用途统一派生为明面 `#D70015`（5.38:1）+ 暗面文字档 `#FF6961`。`#E5484D` 列入旧值扫描清单（§4.7）。
3. **暗色 hairline = `rgba(255,255,255,0.14)`**：需求授权「白色低透明阶」；对相邻三表面全部 ≥1.5:1（分隔线可辨），并为非文本线设定 1.2:1 全局下限断言（WCAG 对分隔线无数值要求，此为自设客观锚点，服务 R-UI-5）。
4. **明色成功点 `#22A06B` → `#1E8E5A`**：旧值对 #f5f5f7 仅 3.06:1，贴线有舍入风险；新值 3.80:1 留足余量。
5. **搜索高亮蓝的语义豁免**：DESIGN.md 单一强调色原则下，搜索命中高亮是搜索交互的直接视觉反馈，归入交互蓝语义（UI-AC-03 走查口径的**唯一登记豁免**，仅出现在搜索态）；mark 文字用 ink（非蓝字）保证可读性，底为 accent 低透明底色（`--pg-highlight-bg`）。
6. **琥珀全面退场**：`#F59E0B` 废弃；琥珀唯一含义 = Exposed（明 `#B45309`/暗 `#FF9F0A`，均为文字档达标值）；R-01 平台横幅与保护拒绝提示改中性/危险语义（`terminate.ts:38` warning→error）。
7. **危险 hover 升格为素面语法，删除 tint 派生档**（v1.1 按 M-01 采纳审查者替代②）：原方案 hover 底色 tint（暗 rgba(255,105,97,0.12)、明 rgba(215,0,21,0.07)）经审查者独立复算，danger-text×tint 叠加对全部低于 4.5:1（暗 over #272729=4.447、over #2a2a2c=4.259；明 over #f5f5f7=4.375），且叠加对不在断言矩阵内、自动化不拦截。据此：`--pg-danger-tint` token 废除（不落地）；hover/:focus-visible 升格 = 文字与描边自 hairline/ink 升至 `--pg-danger-text`、底保持素面，升格信号由描边色迁移承担。素面四对全部达标：明 danger-text×canvas=5.38、×surface=4.94；暗 danger-text×#272729=5.29、×#2a2a2c=5.08，已补入 §4.6 断言矩阵（即既有 danger-text×表面全集对，无新增 token、无扫描特例）。

### 4.2 语义色三层规则（D-UI-03 落地）

| 层 | 色 | 唯一含义 | 出现位置 | 禁止 |
|---|---|---|---|---|
| 交互层 | accent 系（明 #0066cc/暗 #2997ff 文字档；填充档见派生裁定 1）+ 焦点环 | 可点击/可聚焦/选中/搜索高亮（豁免登记） | 链接、Tab 选中、焦点环、高亮 mark、antd primary/链接 | 作状态色（现 TCP=蓝/UDP=绿描边徽标废除，`App.vue:438-446`） |
| 语义层-Danger | danger 系 | 破坏性操作确认、保护拒绝、扫描失败点 | 确认弹窗主钮、行内按钮 hover/焦点升格、错误文案、错误状态点 | 常态列表红元素（目标：同屏常态 0，UI-AC-03/17） |
| 语义层-Warning | warning 琥珀 | 仅「对外暴露 Exposed」，且仅 Exposed>0 | PORT 列短标签「对外」、统计条该数字 | 复用于统计其他项/Pending/横幅/提示 |
| 语义层-Success | success 绿 | 仅「监控运行中」状态点 | 页眉 8px 圆点 | 作协议色（现 UDP 绿徽标废除） |

### 4.3 圆角五档分配表（UI-AC-04 断言的完备清单）

| 档（token） | 值 | 分配 |
|---|---|---|
| none | 0 | 仅全幅条带（页眉/统计/表格区） |
| `--pg-radius-xs` | 5px | ⌘K 键帽、高亮 mark、tooltip、搜索清除钮 |
| `--pg-radius-sm` | 8px | 行内「结束」、抽屉次级按钮、弹窗取消钮（次级 utility 族） |
| `--pg-radius-md` | 11px | 抽屉内嵌块、设置 popover（胶囊外次级控件族） |
| `--pg-radius-lg` | 18px | Drawer 面板、确认弹窗（卡片/浮层面板族） |
| `--pg-radius-pill` | 9999px | 搜索框、主按钮（弹窗红色主钮）、Tab 容器与段内选中 chip、图标钮（28×28 圆）、状态点/圆点 |

现状迁移：SearchBar 9px→pill；键帽 5px 保留；抽屉内嵌块 8px→11px；状态点 50%→pill token（断言集合收敛为 `{0,5,8,11,18,9999}`）；HighlightText mark 2px→5px。

### 4.4 间距档（DESIGN.md spacing 键名对齐）

`--pg-space-1..6` = 4/8/12/16/24/32px（对应 xxs/xs/sm/md/lg/xl）。**md 定档 16px 而非 DESIGN.md 的 17px**：8px 栅格对数据工具更稳，属 §4.4 密度适配授权范围（「条带留白 12–24px 档」），且间距 px 不在硬约束清单。section=80px 营销页留白不适用（需求 §2 不适用项）。

### 4.5 排版定档（§4.2 授权范围内的 px 定档）

| 项 | 定档 | 断言 |
|---|---|---|
| 字体栈 | `system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', sans-serif`（需求栈 + PingFang SC 中文回退补位） | 含 system-ui/-apple-system（UI-AC-05） |
| 字重梯 | 300/400/600/700，**禁 500** | 全 src 扫描（现仓已无 500，基线干净） |
| 页面标题 | 17px/600/字距 **-0.2px**/行高 22px（Display 语法定档：需求授权「-0.2px 级」） | 600 + 负字距存在 |
| 数据面基准 | **13px**/400，行高 20px（1.54，≥1.4 ✓）；强调值 600 | 12–14px 区间断言 |
| 辅助档 | 12px（表头/次要说明/键帽）；抽屉正文 12px→13px 升档 | — |
| 字距规则 | 仅 ≥17px 档允许负字距；12–14px 档零字距；**全仓禁止正字距与 `text-transform: uppercase`**（清除 `DetailDrawer.vue:329-334`、`App.vue:383`） | 扫描断言 |
| 数字 | `.pg-num` 工具类 = `font-variant-numeric: tabular-nums`；应用于端口/PID/时长/统计数字/抽屉数值 | 类存在 + 应用点断言（UI-AC-06） |
| 表头 | 中文、12px/600、muted、无大写变换（§4.4「表头中文常规体」落档） | 文案断言（UI-AC-22） |

### 4.6 对比度断言全集（UI-AC-09 自动化的完整对清单）

`tests/unit/design-tokens.test.ts` 内实现 WCAG 相对亮度公式（sRGB 线性化 + L=0.2126R+0.7152G+0.0722B），断言：

- **文本 ≥4.5:1**（文字档 token × 所属表面全集）：明 {ink, muted, accent, danger-text, warning} × {canvas, surface}；暗 {text, muted, accent, danger-text, warning} × {canvas(#272729), surface(#2a2a2c)}；白字 × {accent-fill, danger-fill}（双主题）。其中 **danger-text×{canvas, surface} 双主题四对即危险 hover 升格素面态的完整覆盖**（hover 时行底为 surface、键盘焦点不悬停时为 canvas；v1.1 按 M-01 补注，无 tint 叠加对存在，见 §4.1 派生裁定 7）。
- **禁用文字 ≥3:1**：明 #7a7a7a/canvas、暗 #808082/#272729；**保护原因文案 ≥4.5:1**：走 muted 档（已含于上）。
- **非文本 ≥3:1**：success 点 × {surface, canvas}（双主题）、warning × 全表面、焦点环 × 全表面。
- **hairline ≥1.2:1（自设可辨下限）**：明 #e0e0e0 × {canvas, surface}；暗 rgba(255,255,255,0.14) 按混合公式计算后 × {#252527, #272729, #2a2a2c}。
- **登记项（不设数值断言，明示理由）**：暗面确认弹窗红填充（#D70015）对弹窗面（#2a2a2c）边界对比 2.66:1——UI-AC-09 的非文本 3:1 规则明确限定「绿/琥珀作为非文本标识」，红填充按钮由白字 5.38:1（文字档）与 pill 形状承担可辨识性；此边界值在此登记供截图走查复核。
- rgba token（hairline/highlight/scrim）在断言中先按 alpha 与指定表面混合成实色再计算，公式入测试工具函数，保证可复现。

### 4.7 旧值/旧形态源码扫描断言（UI-AC-01/02/04/05/07 的自动化载体）

**激活分级**：断言与组件迁移同步激活，避免中间态误报——**阶段 A 激活**：token 三处同源、对比度矩阵、旧色值（范围 `src/renderer/**`，`src/main/index.ts:117` 的启动底色随阶段 C 更新后扩展至 `src/**`）、字重、阴影规则、字体栈、`.pg-num` 存在；**阶段 B 激活**：圆角字面量、字距符号、uppercase 禁令、tabular 应用点、copy-contract 的模板块扫描（此时组件已全部迁移）。终态（阶段 C 起）为下表全集。

| 扫描项 | 规则（`design-tokens.test.ts` / `copy-contract.test.ts`） |
|---|---|
| 旧色值 | `src/` 全树大小写不敏感扫描，以下 16 值零命中：`#F6F7F9 #E7E9ED #1D2129 #667085 #98A2B3 #4F6EF7 #22A06B #F59E0B #E5484D #17191D #1E2126 #24282E #30343B #A7ADB7 #6D85FF #F2F4F7` |
| 三处同源 | `variables.less` / `themes.less` / `theme.ts` 对每个语义 token 的值恒等（解析比较） |
| 圆角 | 源内所有 `border-radius`/`borderRadius` 字面量 ∈ {0, 5, 8, 11, 18, 9999, 50%→禁止}；组件一律引用 `var(--pg-radius-*)` 或 antd token |
| 字重 | 全 src `font-weight` ∈ {300,400,600,700}，`500` 零命中 |
| 阴影 | `box-shadow` 字面量仅允许：`variables.less`（token 定义）与 base.less 的 `box-shadow: none` 中和块；组件层仅允许 `box-shadow: var(--pg-shadow-overlay)` |
| 字体/字距 | 栈含 `system-ui`/`-apple-system`；`letter-spacing` 仅允许 0 或负值；`text-transform: uppercase` 零命中 |
| tabular | `.pg-num{...tabular-nums...}` 存在且 App/抽屉数字单元格引用 |

### 4.8 antd ConfigProvider token 同步策略（R-UI-1 首道手段）

`App.vue` 的 `antdThemeConfig` 改为从 `theme.ts` token 镜像生成（替代现硬编码 8 键，`App.vue:30-42`）。映射表：

| antd token | 浅色 | 深色 | 来源 token |
|---|---|---|---|
| `algorithm` | defaultAlgorithm | darkAlgorithm | — |
| `colorBgBase` / `colorBgContainer` / `colorBgElevated` | `#ffffff` ×3 | `#252527` / `#272729` / `#2a2a2c` | `--pg-bg` / `--pg-canvas` / `--pg-elevated` |
| `colorTextBase` | `#1d1d1f` | `#ffffff` | `--pg-text` |
| `colorTextSecondary`/`Tertiary`/`Quaternary` + `colorTextDisabled` | `#6e6e73` / `#7a7a7a` | `#cccccc` / `#808082` | `--pg-muted` / `--pg-disabled` |
| `colorPrimary` | `#0066cc` | `#0071e3` | `--pg-accent-fill`（派生裁定 1） |
| `colorLink` / `colorLinkHover` | `#0066cc` / `#0059b3` | `#2997ff` / `#55aaff` | `--pg-accent`（文字档） |
| `colorError` / `colorErrorText` | `#D70015` ×2 | `#D70015` / `#FF6961` | `--pg-danger-fill` / `--pg-danger-text` |
| `colorWarning` / `colorSuccess` | `#B45309` / `#1E8E5A` | `#FF9F0A` / `#30D158` | `--pg-warning` / `--pg-success` |
| `colorBorder` / `colorBorderSecondary` | `#e0e0e0` | `rgba(255,255,255,0.14)` | `--pg-hairline` |
| `borderRadius` / `borderRadiusSM` / `borderRadiusLG` | 8 / 5 / 18 | 同 | 圆角档（UI-AC-04） |
| `fontFamily` | 字体栈 | 同 | §4.5 |

版本能力证据：`colorLink/colorLinkHover` 为 alias token（alias.d.ts:26-28）、`colorBgElevated/colorWarningText/colorErrorText` 为 map token（maps/colors.d.ts:70/233/320）、`borderRadiusSM/borderRadiusLG`（maps/style.d.ts:24/32）——ant-design-vue@4.2.6 全部支持；alias/map 级 token 若个别未生效，执行期回退 = `.ant-*` CSS 类覆盖（与 Drawer/Modal 同一机制，全分支程序见 §13 D-UI-B）。antd 运行时注入的焦点/激活 box-shadow 由 base.less 定向中和（`box-shadow: none` 允许清单见 §4.7），焦点观感统一收敛到 2px outline 焦点环。

---

## 5. 布局重构设计（窗口 960×600 min / 1280×800 默认 / 2560×1600 大屏三档下成立）

### 5.1 页眉（52px，唯一标题层）

- macOS hiddenInset：页眉即拖拽区 + 标题层（详见 §7）；`padding-left: 80px` 避让交通灯（x=16 + 灯组宽 ~52px）。
- 标题：`PortGate · 端口门禁`（COPY 保留；17px/600/-0.2px）；右侧依次：监控状态（8px 圆点 + 「监控中」/「扫描失败」12px muted，错误态点与文字用 danger-text）、主题图标钮、设置图标钮。
- 主题图标钮（28×28 pill 圆、hairline、ink 图标，sun/moon SVG 自绘）：tooltip 显示当前主题名「浅色/深色」（D-UI-07；主题名不常驻）。原 a-switch + 英文名废除（`ThemeToggle.vue` 重写）。
- 设置图标钮：popover（11px 档、elevated 面、hairline）内容 = 扫描周期三档分段（「1 秒 / 2 秒 / 5 秒」，调既有 `settings:set` scanInterval）+ 提示行。**范围解释**：D-UI-07/UI-AC-21 明列「设置入口」，而现仓 scanInterval 无任何 UI（§2.3 证据）；本方案以最小化方式将其既有能力界面化，无新设置项、无 IPC 变更、无新 channel（登记供 reviewer 裁定，§11.4）。
- 拖拽/交互冲突规避：`.pg-header { -webkit-app-region: drag }`；页眉内全部按钮/浮层锚点 `no-drag`；状态点为纯展示随拖拽区。页眉内 `user-select: none`。
- Win/Linux：TITLEBAR_MODE 语义决定页眉无重复标题（§7.4）；R-01 横幅改中性 notice（surface 底 + hairline + ink 文本），废除 a-alert 的 warning 琥珀。

### 5.2 统计条（40px 条带）

- 形态：`端口 46 · TCP 38 · UDP 8 · 对外 5`——中文标签 12px muted + 数字 13px/600 ink `.pg-num`，`·` 分隔（COPY 统一给出）。
- 琥珀唯一条件：仅 `stats.exposed > 0` 时「对外」数字用 `--pg-warning`，否则中性（现 `App.vue:190-199` 恒琥珀废除）。TCP/UDP/端口恒中性。
- 面层：`--pg-surface` 条带（全幅 0 圆角），上下留白 12px（space-3）。

### 5.3 当前/历史 Tab（Apple 化分段控件）

- **自绘分段控件替换 a-tabs**（R-UI-1 自绘预算内，~40 行）：pill 容器（hairline 描边 + surface 底）；段 = 「当前 N」「历史 M」（计数口径不变：当前=records.length，历史=port:history 返回条数）；选中段 = elevated chip（pill）+ accent 文字 600；未选中 muted 400；按压 scale(0.95)。
- 选中色 = 交互蓝（UI-AC-19：明 #0066cc/暗 #2997ff——文字档，非填充，避开暗面白字 3.01:1 陷阱）。
- `user-select: none`（分段与表头，CSS 断言）；双 tab 内容切换逻辑、`port:history` 拉取时机（watch activeTab，`App.vue:56-60`）零改动。

### 5.4 主表格（antd Table 保留，token + 定向覆盖）

- **列定义**（入 `copy.ts` 为数据常量，断言载体）：`端口 120px｜进程 min 220px 弹性｜应用 140px｜地址 弹性｜运行时长 96px｜操作 88px`。需求 §6-3 六列中文表头：端口/进程/应用/地址/运行时长/操作。PROJECT 列删除（§6）；APP 列保留。960px 窄窗口下两弹性列收缩仍无横滚（scroll.x 不设）。
- **行密度**：cell padding `10px 12px`（space-3 横向）+ 13px/20px 单行 + 1px 分隔 = 行高 ~47–48px，落 44–60 区间（目标 48 ✓）；可视行数对 V1（~128px 行高）≥2×（UI-AC-10）。
- **单行化**：全部单元格 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`；废除任何 word-break（`DetailDrawer.vue:361` 的 break-all 一并废除，地址完整值由 tooltip 与抽屉承担）。
- **端口单元格**：`{port}` 13px/600 `.pg-num`（HighlightText，field `port`）+ `TCP/UDP` 12px muted 纯文本（无配色无徽标）+ Exposed>0 时「对外」11px warning 短标签（唯一语义色）。三要素单行（UI-AC-11）。
- **进程单元格**：`{process.name}`（HighlightText，`processName`）+ 次要文本 `PID {pid}`（pid 数字走 HighlightText，field `pid`）+ 有 project 时 `· {project.name}`（HighlightText，`projectName`）——次要文本 12px muted，与主文本同行省略。中点用法符合需求 §6-7（并列同类短元数据）。
- **应用单元格**：`{application.name}`（HighlightText）；无则 muted「—」占位（保留；UI-AC-13 的「无空占位」仅约束 project）。
- **地址单元格**：`{localAddress}:{localPort}`（HighlightText，`localAddress`）+ state 存在时次要文本 `{state}`（**无 `·` 前缀**，修正 `App.vue:275-278`）；a-tooltip 显示完整地址（remote 存在时 `local → remote`，`→` 常量来自 COPY）；UI-AC-12 的 word-break/ellipsis 样式断言落此。
- **运行时长单元格**：`formatDuration` 紧凑式 `.pg-num`（§8.3 格式规则）。
- **操作单元格**：三级语法按钮（§5.5）。
- **行分隔**：tbody `td { border-bottom: 1px solid var(--pg-hairline) }`；斑马纹废除（行底透明）、表格外框卡片废除（`.ant-table`/容器 bg transparent、去圆角壳与描边）；表头底部同 hairline（UI-AC-14）。
- **hover**：行 `--pg-surface`（tile 微阶语法）；点击行开抽屉行为不变（customRow onClick 保留）。
- **空态**：`#emptyText` 自绘——当前 Tab 无端口「暂无监听端口」；搜索无命中「没有匹配的结果」（附次行 muted「试试其他关键词或清空搜索」）；历史「暂无历史会话」（COPY 表）。
- **历史表**：`端口｜进程（含 project 次要文本）｜时间区间｜时长`（PROJECT 列同步并入；`17:30 - 18:42` 区间 + `1h12m` 分列呈现）；分页保留（token 化）。

### 5.5 操作按钮三级语法（UI-AC-17/18）

1. **行内「结束」（常态中性）**：自绘 `.pg-btn`（8px 档、28×28+ 最小点击区、hairline 描边、transparent 底、ink 文本 12px）——常态列表红色元素 0。`hover/:focus-visible` 升格（素面语法，§4.1 派生裁定 7）：文字与描边自 hairline/ink 升至 `--pg-danger-text`、**底保持素面不引入 tint**，升格信号由描边色迁移承担；`:active` scale(0.95)。`@click.stop` 保持。
2. **保护进程禁用态**：同位渲染禁用样式（`--pg-disabled` 文字 + hairline 描边，对比 ≥3:1 由 token 承载）；**行内可见性 = a-tooltip**（内容「系统进程，受保护（{level}），禁止结束」，COPY 表，气泡文字走默认 ink/elevated ≥4.5:1）；点击无响应且不弹确认框（现行逻辑保持，`App.vue:284-294` 分支保留）。**Drawer 内为行内常显原因文案**（12px muted ≥4.5:1），满足 UI-AC-18「旁边/tooltip 可见」两选一的完整覆盖：行内=tooltip、抽屉=常显。
3. **确认弹窗（红色主按钮唯一出现处）**：antd Modal（18px LG 圆角 + `--pg-elevated` 面 + `--pg-shadow-overlay` + scrim token）；主按钮 = pill + `--pg-danger-fill`（colorError token）+ 白字（5.38:1）；文案含进程名/协议/端口/PID（`terminate.ts:44-49` 既有 content 入 COPY 表）；PENDING_FORCE 二次强制弹窗同语法（「强制结束」）。
- antd `message`（已结束/已复制/拒绝原因）跟随 token；拒绝提示 `message.warning`→`message.error`（琥珀语义守卫，`terminate.ts:38`）。

### 5.6 搜索框（pill 化，⌘K 行为零改动）

- `border-radius: var(--pg-radius-pill)`（9px→pill，对基线 §24 的授权变更）；高 44px 保持；左搜索图标 muted 16px；右键帽 5px 档（保留）；placeholder 走 COPY（现值已合规）。
- `:focus-within`：hairline→accent 描边 + 2px `--pg-focus` outline（offset 1px）；清除钮 5px 档、28px 点击区；整体 `.pg-press` 不适用（输入框不按压）。
- `onGlobalKeydown` ⌘K 逻辑、防抖链路（`SearchBar.vue:21-27` → `stores/ports.ts` QUERY_DEBOUNCE）零改动。

### 5.7 Drawer 重塑（480px 宽保持）

- 面板：左缘 `--pg-radius-lg`（18px）圆角（右侧贴窗缘）、左缘 hairline、面板 `--pg-canvas` 底、`--pg-shadow-overlay`（唯一功能阴影使用点之一）、mask 换 `--pg-scrim`（antd drawer mask 覆盖）。UI-AC-20。
- 分区：**应用与项目 / 网络 / 进程 / 时间 / 运行时**（五区，与现状 IA 对齐、改动最小；首区由「Application / Project」中文化，v1.1 按 m-04 补记落位）——中文分区标题 12px/600 muted，**废除大写英文**；内嵌块 11px 档 + hairline + `--pg-surface` 底。首区两行：应用（`application.name`，HighlightText `applicationName`，无则「—」）、项目（`project.name`，HighlightText `projectName`，无则「—」）。
- 行：dt 12px muted 固定 104px（标签中文化：端口/地址/协议/状态/暴露/PID/PPID/用户/可执行文件/命令/工作目录/启动时刻/运行时长/首次出现/最近出现/端口存续/CPU/内存——技术值 TCP/UDP/LISTEN 等英文原样）；dd 13px ink；等宽字体仅路径/命令保留。
- 暴露完整定义保留：「Exposed 对外监听 / Local 仅本机」+「对外监听 ≠ 公网可达」提示（基线语义不变，需求 §6-5）。
- 底部按钮：打开项目目录 / 复制命令（8px 档次级）+ 结束进程（中性 ghost，hover 红升格；保护进程禁用 + 行内常显原因）——与行内三级语法同款。`record:reveal`/clipboard 逻辑零改动。
- 十项信息（AC-04）与高亮（HighlightText 各字段）完整保留；remote 存在时 Network 区地址以 `→` 连接。

### 5.8 确认弹窗 / popover / tooltip 汇总

Modal：18px/elevated/shadow/scrim、ok=pill 红、cancel=8px 次级；SettingsMenu popover：11px/elevated/hairline；a-tooltip：5px 档、elevated 面（antd tooltip token 覆盖）。

---

## 6. PROJECT 列并入进程列（D-UI-04）——引擎影响面核对结论

**结论：`src/main/core/search/fields.ts` 零变更。**

- 取值路径核对：`projectName` 的 getValue 为 `r.project?.name`（`fields.ts:72`），与渲染位置无关；`projectPath` 自 V1 起**仅参与检索、不在抽屉渲染**（抽屉「工作目录」行呈现的是 `process.workingDirectory`，`DetailDrawer.vue:216-223`；`project.path` 无界面落点），本次维持该口径。18 字段表、分值档位、高亮区间产出（`matches[recordId].highlights.projectName`）全部不变。
- 变更纯在渲染层：App.vue 删除 PROJECT 列定义与单元格模板（`App.vue:103-105`、`258-268`），project 名称改在进程单元格以次要文本渲染，仍经 HighlightText 消费同一 `projectName` 区间——UI-AC-13「搜索命中项目名时行内高亮」由此直接成立。
- 测试影响面：(a) 既有 `search-engine.test.ts` 18 字段断言不变更、继续全绿（护栏证据 §2.3）；(b) 新增 `app-shell.test.ts` 断言：columns 无 PROJECT、进程单元格在提供 projectName 区间时渲染 `<mark>`（复用 HighlightText 组件逻辑）、无 project 时不渲染占位；(c) `<mark>` 唯一性架构断言不受影响（高亮仍只出自 HighlightText.vue）。
- 历史表同步：`PortSession.projectName` 在历史进程列以次要文本呈现（无高亮——历史检索无命中区间，与 V1 v1.4 MINOR-R4-003 收窄口径一致）。

---

## 7. hiddenInset 实现细节（D-UI-05）与 R-UI-2 回退开关

### 7.1 平台分支落位（架构护栏兼容）

- 新增 `src/main/platform/window.ts`：`export function getWindowOptions(): { titleBarStyle?: 'hiddenInset'; trafficLightPosition?: { x: number; y: number } }`——内部读取 `process.platform`（arch-boundary 断言的唯一合法区，`tests/unit/arch-boundary.test.ts:59-74`）；`darwin && TITLEBAR_MODE === 'inset'` → `{ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 20 } }`，否则 `{}`。
- 交通灯 y=20 的依据：页眉高 52px、灯组高 12px，垂直居中 (52−12)/2=20；x=16 与 80px 内容避让配对（16+52=68 < 80）。
- `src/main/index.ts`：`new BrowserWindow({ ...getWindowOptions(), ... })`；`backgroundColor` 更新为 `#252527`/`#ffffff`（消除启动闪色与主题不符）；`title` 属性保留（hiddenInset 下系统层不绘制标题文本，仅供辅助功能/窗口菜单）。

### 7.2 拖拽区与交互控件冲突规避

- `.pg-header { -webkit-app-region: drag }`；页眉内按钮/浮层锚点显式 `-webkit-app-region: no-drag`；搜索框/表格/抽屉位于页眉外，不受拖拽区影响。
- 页眉文本 `user-select: none`（拖拽区本身不响应选择，双保险，并入 UI-AC-19 断言口径）。
- 双击页眉 = 系统默认缩放行为（hiddenInset 标准表现），列入阶段 C 人工清单确认可接受。

### 7.3 页眉标题显隐规则（renderer）

`showHeaderTitle = (TITLEBAR_MODE === 'inset') && !isNonMacPlatform`（沿用 `App.vue:23-25` 的 navigator.userAgent 合法判定，不触碰 `process.platform`）。语义：TITLEBAR_MODE='inset' 时 macOS 页眉为唯一标题层；Win/Linux（isNonMacPlatform）页眉无重复标题、仅状态+控件（UI-AC-21 后半句）。

### 7.4 R-UI-2 回退开关（单点、可独立 revert）

- `src/shared/constants.ts` 新增 `export const TITLEBAR_MODE: 'inset' | 'system' = 'inset'`。
- 翻转为 `'system'` 的效果（一处常量，无需改任何组件逻辑）：main 不注入 hiddenInset（系统标题栏恢复）；renderer `showHeaderTitle` 恒 false（全平台页眉去重复标题、仅留状态与控件）——即需求 R-UI-2 指定的回退形态「恢复系统标题栏 + 仅去重复标题」，不阻断其余验收。
- 该常量为纯项目常量（非平台探测），与 CSP 同级管理；平台相关的「是否适用」判定全部在 `platform/window.ts` 内完成。

---

## 8. 文案常量表单一来源（D-UI-06/UI-AC-22）

### 8.1 单一来源与规则

- 新增 `src/renderer/copy.ts`：`COPY`（全部界面字符串，含嵌套分组 header/stats/tabs/table/actions/drawer/empty/tooltips/settings/banner）、`COLUMN_DEFS`（当前表/历史表列定义：中文 label + key + width）、`SEP`（`DOT: '·'`、`ARROW: '→'`、`ELLIPSIS: '…'`）。组件模板一律引用常量，禁止散落字面量（断言 §8.4）。
- **中文标签**：搜索、结束进程、强制结束、复制命令、打开项目目录、当前、历史、设置、监控中、扫描失败、端口、进程、应用、项目、地址、运行时长、操作、浅色、深色、系统进程，受保护、没有匹配的结果、暂无监听端口、暂无历史会话、对外、仅本机、应用与项目、网络、时间、运行时、用户、可执行文件、工作目录、启动时刻、首次出现、最近出现、端口存续、1 秒/2 秒/5 秒 等（全量落表；「应用」「项目」为 §5.7 首区行标签，v1.1 按 m-04 补入）。
- **技术标识符英文原样、不改大小写**：TCP、UDP、PID、PPID、LISTEN、ESTABLISHED、⌘K、Docker、macOS、SIGTERM、SIGKILL、Exposed、Local、USER/SYSTEM/SYSTEM_CRITICAL/UNKNOWN（保护级值）。
- **品牌名豁免**：`PortGate · 端口门禁` 保留（产品名，非并列元数据）。
- **改写边界**：格式规则约束 UI 自产文案；数据原值（命令行、路径、容器映射串）不作字符替换。

### 8.2 统计与中点规则

- 统计形态 `端口 {n} · TCP {n} · UDP {n} · 对外 {n}`（COPY 顺序化模板）；`·` 仅用于并列同类短元数据（统计项、进程单元格的 `PID x · 项目名`、抽屉时间区间的 `时刻 · 时长`）；键值对一律标签式（`PID 22415`、裸 `LISTEN`），禁止 `·` 连接异质维度（修正 `App.vue:245/275-278`）。

### 8.3 格式化规则（`utils/format.ts` 变更 + 断言）

- 时长：秒位为零则省略——`45s`、`60s→1m`、`150s→2m30s`、`3600s→1h`、`4980s→1h23m`（现 `1m0s`/`1h0m` 形态消失；`tests/unit/format-duration.test.ts` 全分支断言）。
- 省略号 `…`、箭头 `→`、区间连字符 `17:30 - 18:42` 保持；中文语境中文标点。

### 8.4 自动化断言（`copy-contract.test.ts`）

1. COPY 键位完整性：表头六项、按钮、状态、空态、tooltip、统计模板、设置项逐键存在且等于规定值（对上表抽样全查）。
2. `src/renderer/**/*.vue` **模板块**（`<template>` 截取）扫描零命中：`->`、`...`、`2m0s` 正则 `\d+m0s`、全大写英文表头词（PORT/PROCESS/APP/ADDRESS/UPTIME/ACTION/PROJECT）、英文主题名（Cloud Slate/Midnight Slate）、`（\d+）` 式 Tab 计数括号。
3. 时长负向：`formatDuration(120_000) === '2m'` 等（§8.3）。
4. 搜索 placeholder 与高亮不受文案规则影响（检索对象为数据值本身，HighlightText 行为不变——需求 §6 尾注，回归由既有套件承担）。

---

## 9. 分阶段实施（3 个提交点，依赖链 A→B→C）

> 每阶段一个提交点，主理人在「阶段完成 + QA 验证」后提交；回滚 = `git revert <该阶段提交>`；revert 上游须连带下游（与 V1 §7 同口径）。每阶段完成判据：新增断言全绿 + 既有 185 用例全绿 + `npm run typecheck` / `npm run lint` 通过。

### 阶段 A：设计 token 体系 + 文案基座（中间态 = 新色板 + 旧布局，可运行）

- 影响文件：`styles/variables.less`、`styles/themes.less`、`styles/base.less`、`theme.ts`、`copy.ts`（新）、`utils/format.ts`、`HighlightText.vue`（仅样式）、`App.vue`（仅 ConfigProvider token 块 + 全组件 CSS 变量引用改名 `--pg-background/surface/border/text/secondary/muted/accent/success/warning/danger` → §4.1 新名；不改任何布局/结构）、`SearchBar.vue`/`DetailDrawer.vue`/`ThemeToggle.vue`（仅变量引用改名）、`composables/terminate.ts`（仅文案入表，warning→error 留待阶段 B）；新增 `tests/unit/{design-tokens,copy-contract,format-duration}.test.ts`（copy-contract 本阶段仅含 COPY 完整性/分隔符/格式断言，模板块扫描随阶段 B 激活，§4.7 分级）。
- 实现步骤（依赖序）：① variables.less 双主题全集 + 派生 token → ② themes.less 双作用域 → ③ theme.ts 镜像 + App.vue ConfigProvider 映射表（§4.8）→ ④ base.less（栈/13px/`.pg-num`/焦点环/按压态/antd 阴影中和）→ ⑤ 全组件变量改名（不改布局）→ ⑥ copy.ts + format.ts + 组件文案切换 → ⑦ 三个新测试文件。
- 测试/验证：§4.6 对比度全集、§4.7 阶段 A 分级扫描（token 三处同源/旧色值 `src/renderer` 范围/字重/阴影/字体栈）、COPY 完整性与 format 断言全绿；**既有 185 全绿**（旧断言零依赖旧色板，§2.3 证据）；dev 冒烟：双主题切换生效、antd 组件按新 token 渲染（D-UI-B 判据，§13）。
- UI-AC：01/02/04/05/07/09 的自动化部分、22 的自动化部分。
- 回滚：revert 本阶段提交 → 回 V1 视觉基线（因组件布局未动，回退零残留）。

### 阶段 B：布局与组件重塑（renderer 全部形态变更）

- 影响文件：`App.vue`（页眉重构含 showHeaderTitle 占位、统计条、分段 Tab、表格列/单元格/空态、横幅中性化、drag 类挂载）、`SearchBar.vue`（pill/焦点环）、`DetailDrawer.vue`（§5.7 全项）、`ThemeToggle.vue`（图标化+tooltip）、`SettingsMenu.vue`（新）、`stores/settings.ts`（setScanInterval action）、`composables/terminate.ts`（warning→error + 文案表化）；新增 `tests/unit/app-shell.test.ts`。
- 前置条件：阶段 A 已合入（token/文案可用）。
- 实现步骤（依赖序）：① copy.ts 列定义接入 App（列结构变更 + PROJECT 并入，§6）→ ② 表格密度/单行化/hairline/hover/空态 → ③ 分段 Tab → ④ 页眉结构（状态点/图标钮/设置入口/drag/no-drag 类）→ ⑤ 搜索框 pill → ⑥ Drawer → ⑦ 弹窗/浮层 radius 与 scrim/shadow 覆盖 → ⑧ app-shell 测试。
- 测试/验证：app-shell 断言（列头中文六项、无 PROJECT 列、进程单元格 projectName 命中出 `<mark>`、无 project 不渲染占位、行高常量推算 44–60、user-select 断言、点击区 28 常量）全绿；**copy-contract 扩展模板块扫描 + design-tokens 扩展组件级扫描（圆角字面量/字距符号/uppercase/tabular 应用，§4.7 分级）全绿**；**185 + 阶段 A 断言复跑全绿**；dev 真机走查：搜索/⌘K/终止确认/保护禁用/历史四流程无功能回归。
- UI-AC：03/06/10（自动化口径 = 行高常量推算 + 单行样式断言；「可视行数 ≥2×」以截图复核）、11/12（样式断言部分）/13/14（源码口径）/16/17/18（自动化部分）/19/23。
- 回滚：revert 本阶段提交 → 退回阶段 A 中间态（token 已就位、布局复原）。

### 阶段 C：hiddenInset + 截图验收 + 终验（main 进程窗口外观 + 验收资产）

- 影响文件：`src/main/platform/window.ts`（新）、`src/main/index.ts`（窗口选项/backgroundColor）、`src/shared/constants.ts`（TITLEBAR_MODE）、`src/main/dev/capture.ts`（新）、`package.json`（capture script）、`.gitignore`（screenshots/）。
- 前置条件：阶段 B 页眉结构就位（drag 类/图标钮）。
- 实现步骤：① platform/window.ts + index.ts 接线 → ② TITLEBAR_MODE 开关 → ③ capture 脚本（§10）→ ④ 暗色先行截图评审（image-analyst）→ ⑤ 评审意见修复（如涉 P2 裁剪按 R-UI-1 序位，见 §12）→ ⑥ 人工清单终验（含 AC-01~16 抽查复验 = UI-AC-24）。
- 测试/验证：全套自动化（185 + 新增）全绿；`npm run capture` 产出 §10.1/§10.2 清单全部 **24 张**非空 PNG（D-UI-C 判据）；image-analyst 十锚点走查双主题 PASS；人工清单（§10.4）全项通过。
- UI-AC：08/15/20/21/24/25 及全部截图项终验。
- 回滚：revert 本阶段提交（hiddenInset/截图资产独立回退，A/B 不受影响）；hiddenInset 单项故障可仅翻 TITLEBAR_MODE 热修（§7.4）。

---

## 10. 截图视觉验收方案（UI-AC-25，暗色先行）

### 10.1 截图集清单（9 状态 × 明暗 = 18 张；v1.1 按 M-02 增补强制弹窗与设置 popover）

| # | 状态 | 构造方式 | 主要验收锚点 |
|---|---|---|---|
| 01/02 | 列表 | 启动即拍（真机端口） | 行单行/hairline/无红元素/无斑马纹/列宽 |
| 03/04 | 搜索态 | DOM 注入关键词 `node` | 高亮 mark 形态、排序、语义色 ≤1 |
| 05/06 | Drawer | 点击首行 | 18px/11px/中文分区（含「应用与项目」首区）/按钮语法/十项信息 |
| 07/08 | 历史 Tab | 脚本内起停 `127.0.0.1:18123` HTTP 服务生成一条会话 | 分段控件/区间时长格式/PROJECT 并入 |
| 09/10 | 确认弹窗 | 点击 USER 行「结束」 | 红 pill 主钮/scrim/18px/文案 |
| 11/12 | 强制弹窗（PENDING_FORCE） | 脚本内起**忽略 SIGTERM** 的监听进程（`python3 -c`：`signal.signal(SIGTERM, SIG_IGN)` + http.server 监听临时端口）→ 点击该行「结束」→ 等 KillPolicy 3s 宽限转 PENDING_FORCE → 弹窗截图；收尾对助手进程补 SIGKILL 清理。脚本构造失败时**改道人工采集**（QA 按同一状态触发，验收口径不变） | 「进程未响应 SIGTERM」文案/红主钮语法/scrim |
| 13/14 | 设置 popover | 点击页眉设置图标钮 | 11px 面/hairline/周期三档文案/锚定位置 |
| 15/16 | 空态 | 搜索 `zzzz` | 空态文案/居中/无残骸 |
| 17/18 | 禁用态 | 搜索 `SYSTEM`（protectionLevel 可检索，fields.ts:77） | 禁用对比/tooltip 挂载点/无红色 |

采集顺序暗色在前（R-UI-4：暗色为第一观感达标项，先行评审先行修复）。

### 10.2 采集方式（1280 主档 + 2560 第二遍，v1.1 按 M-02 增补）

`src/main/dev/capture.ts`：`PORTGATE_CAPTURE=1 npm run capture` 触发（dev 专属，复用 `dev/probe.ts` 的 env-gated 模式；`arch-boundary` 扫描范围不含 `src/main/dev/`）。流程：whenReady → 临时 HTTP 服务 → 对 `['dark','light']` 循环：经 `__portgateDevSmoke.settings.setTheme` 切主题 → 等 400ms 过渡 → DOM 驱动九状态 → `webContents.capturePage()` → 写 `screenshots/{状态}-{主题}.png`。**2560 档第二遍**（UI-AC-15 两档窗口要求）：首轮 1280×800 采完后，`mainWindow.setSize(2560, 1600)` 重设窗口，对**表格承载态**（列表/搜索态/历史）×双主题补采 6 张（`-2560` 后缀），判定锚点 = 无横向滚动、无 ≥200px 死空间列、地址列弹性伸展。合计 **18 + 6 = 24 张**。主进程内 fs/http 使用合法（非 renderer）。

### 10.3 image-analyst 走查问题清单模板（每张十锚点，输出 PASS/FAIL + 违规描述）

1. 画布层级正确：暗色近黑 tile 系（非纯黑）、明色白/羊皮纸；旧蓝紫/旧深蓝底无残留。
2. 常态列表无红色元素（搜索态允许 mark 蓝；确认弹窗允许红主钮）。
3. 行内文本单行、无断词、无 `· LISTEN` 式混排；数字纵向等宽对齐。
4. 行分隔仅 hairline 一种；无斑马纹、无表格外框。
5. 搜索框 pill + 44px + ⌘K 键帽；图标 muted。
6. Drawer 左缘 18px + hairline + 分区中文 + 底部按钮语法。
7. 禁用态按钮低对比但 ≥3:1 观感、保护原因可见（抽屉图判行内文案，列表图判 tooltip 锚点）。
8. 统计条：琥珀仅出现在「对外」且仅 >0 时；其余中性。
9. 页眉：无系统标题重复、交通灯不压内容、右侧仅紧凑图标钮 + 状态点。
10. 空态/弹窗/浮层：按 §5.8 形态、无装饰阴影（浮层投影至多一处）。

### 10.4 人工清单（阶段 C，QA 执行）

⌘K 聚焦、页眉拖拽移动窗口、交通灯避让、页眉控件不触发拖拽、**双击页眉缩放行为确认可接受**（v1.1 按 m-05 增补，与 §13 D-UI-A 判据第四项逐一对应）、主题 tooltip、设置 popover 周期切换、主题切换重启持久化、地址 tooltip、保护进程点击无响应、终止/强制/拒绝全流程（含 PENDING_FORCE 弹窗，与截图 #11/12 同源）、历史检索、扫描周期三档生效、AC-01~AC-16 抽查复验（UI-AC-24）。

---

## 11. 行为 / API / 数据语义 / 兼容性变化说明

### 11.1 零变更域（红线复核）

IPC 契约（channel 集合、入参出参、方向）、`src/shared/ipc-contract.ts`、SQLite schema 与 SessionStore、KillPolicy/SecurityClassifier、SearchEngine 与 `fields.ts`（§6 论证）、CSP、preload 桥、平台 Adapter、扫描/事件语义、`app_settings` 键值（`theme: 'light'|'dark'`、`scanInterval ∈ {1000,2000,5000}`）。

### 11.2 用户可见行为变化（全部由需求 §3/§5/§6/§8 授权）

hiddenInset 合并标题（D-UI-05）；时长紧凑格式（#17）；Tab 分段化与计数格式「当前 N」（#14/UI-AC-19）；行内按钮三级语法与禁用原因可见（#1/#10）；地址 tooltip 与 `→`（#3/#17）；主题名「浅色/深色」+ 图标化（D-UI-07）；保护拒绝提示由 warning 改 error（#6 语义守卫）；高亮 mark 文字色 accent→ink（§4.1 派生裁定 5）；R-01 横幅中性化（#6）；设置入口 popover 首次界面化 scanInterval（D-UI-07，见 11.4）。

### 11.3 兼容与迁移

主题持久化键值不变、无数据迁移；旧值直接映射（「浅色/深色」仅为展示文案，D-UI-07）；`settings:get/set` 原样；打包产物不受影响（无新增运行时依赖、electron-builder 配置不动）。

### 11.4 范围解释登记（交 reviewer 裁定，非自批）

「设置入口」popover 为 D-UI-07/UI-AC-21 明列控件的**最小实现**：现仓 scanInterval 已在 settings 契约与 SettingsStore 中存在但无 UI（§2.3 证据）；本方案将其界面化，不新增设置项/channel/存储。若 reviewer 认定该界面化超出「仅视觉与交互层」边界，裁剪路径 = 移除 SettingsMenu.vue 与 setScanInterval action，页眉仅留主题图标钮（不影响其余任何 AC）。

---

## 12. 风险与回滚

| # | 风险 | 概率/影响 | 缓解 | 回滚 |
|---|---|---|---|---|
| R-UI-1 | antd Table/Drawer/Modal 默认样式与 Apple 语法冲突，token 定制深度超预期 | 中/中 | 三道手段按序：ConfigProvider token（§4.8）→ 定向 CSS 覆盖（radius/scrim/shadow/分隔线，选择器面窄）→ 个别控件自绘（已预算：分段 Tab/行内按钮/主题钮/横幅，各 ≤60 行）。**超预期裁剪序位（P2 尾部，不降 P0/P1/硬约束）**：① 空态次行提示文案 → ② 行 hover 过渡动效 → ③ 焦点环 offset 微调 → ④ 历史进程列 project 次要文本 | 阶段独立 revert；自绘控件逐个可退回 antd 原样 |
| R-UI-2 | hiddenInset 拖拽区与交互控件/交通灯冲突 | 低/中 | no-drag 显式清单（§7.2）；UI-AC-21 人工兜底；`TITLEBAR_MODE` 单点回退 = 恢复系统标题栏 + 仅去重复标题 | 常量热修或 revert 阶段 C |
| R-UI-4 | 暗色第一观感不达标（用户核心不满点） | 中/高 | 暗色 token 先行评审（阶段 A 即断言暗色全集）；截图暗色先行（§10.1）；验收顺序暗色优先 | 评审意见在阶段 C⑤ 修复窗口消化 |
| R-UI-6 | 高亮渲染位置迁移遗漏某字段（PROJECT 并入引发回归） | 低/中 | fields.ts 零变更（§6）；app-shell 断言 projectName 联动；搜索态截图锚点 3 | 阶段 B revert |
| R-UI-7 | 截图依赖真机端口状态，两次采集内容不一致 | 确定/低 | 验收锚点全部为结构/token 断言（R-UI-5），不依赖特定进程；禁用态用 protectionLevel 检索确定性构造 | 不适用 |

观测方式：`npm test` 全绿 + `npm run capture` 产物 + dev 启动日志（D-2 smoke 继续输出主题切换与 body bg，自动反映新 token 值）；无新增 main 进程行为。

---

## 13. 执行期决策程序（全分支覆盖；未决假设 0、证据缺口 0 的构成）

### D-UI-A hiddenInset 行为验证程序

- 判据（阶段 C 人工清单）：拖拽移动窗口、交通灯不压内容、页眉控件可点且不拖拽、双击行为可接受。
- 分支表：位置偏差 → 调 `trafficLightPosition`/避让 padding 后复测；交互冲突 → 补 no-drag 后复测；仍失败 → `TITLEBAR_MODE='system'` 回退（§7.4，方案内既定形态），不阻断其余 UI-AC。
- 任一分支均有既定动作，正确性不依赖「hiddenInset 表现完美」假设成立。

### D-UI-B antd token 深度验证程序

- 判据（阶段 A dev 冒烟）：四抽样点按新 token 渲染——容器底色（a-table）、控制圆角（a-button 8px）、危险主钮（Modal.confirm #D70015+白字）、文字/链接色（antd 排版采样）。
- 分支表：seed 级 token 未生效 → 核对 token 名映射后复测；alias/map 级 token（colorLink/colorErrorText 等）未生效（4.2.6 mergeToken 差异）→ 改 `.ant-*` CSS 变量覆盖（与 Drawer/Modal 同机制）；仍不达 → 该控件纳入自绘清单（R-UI-1 序位，P2 裁剪规则兜底）。任一分支不改变 UI-AC 口径。

### D-UI-C capturePage 采集验证程序

- 判据（阶段 C 首跑）：`npm run capture` 产出 §10.1/§10.2 清单全部 **24 张**（18 主档 + 6 张 2560 档）非空 PNG。
- 分支表：黑图/时机问题 → 排查 ready-to-show 与过渡等待后重试；API 失败 → 采集方式降级为 e2e-tester/手动截图，走查清单与验收口径不变（验收方式 = 截图评审，不绑定采集工具）。

### 计数结论

**未决假设 0 项、证据缺口 0 项。** 全部原不确定性已转化为：实测证据（§2）、需求固定值 + 架构师定档记录（§4，均给出对比度计算与授权依据）、全分支执行期程序（D-UI-A/B/C）。其中两项架构师定档（暗面按钮填充 #0071e3、危险红派生 #D70015/#FF6961）与一项范围解释（设置入口 §11.4）为行使需求授权的裁量，显式登记交本轮 reviewer 裁定。

---

## 14. 审查处置表

| 轮次 | 结论 | blocker | major | minor | 处置 |
|---|---|---|---|---|---|
| 初稿（v1.0） | PLAN_READY_FOR_REVIEW | 0（待审） | 0（待审） | 0（待审） | 提交全新独立 reviewer 对抗审查；批准硬条件 = blocker/major/未决假设/证据缺口均为 0 |
| 第 1 轮（ui-reviewer-r1，全新实例） | REVISE（0 blocker / 2 major / 5 minor / 未决假设 0 / 证据缺口 0） | 0 | 2 | 5 | 升版 v1.1 逐项修订：**M-01 接受（采纳审查者替代②）**：删除 `--pg-danger-tint` 派生档，hover 升格=文字/描边升 `--pg-danger-text`+底素面（依据：tint 叠加对暗 4.447/4.259、明 4.375 均 <4.5 且不在断言矩阵；素面四对 5.38/4.94/5.29/5.08 达标），修订位置 §4.1 表×2、§4.1 派生裁定 7（新）、§4.6 补注、§5.5-1。**M-02 接受**：§10.1 增强制弹窗（#11/12，脚本起忽略 SIGTERM 进程走 PENDING_FORCE，失败改道人工）与设置 popover（#13/14），§10.2 增 2560 档第二遍（列表/搜索态/历史 ×双主题=6 张，合计 24），§1.2 行 15/25 同步，§13 D-UI-C 判据改 24 张。**m-01 接受**：§1.2 行 03 改引 §4.1 派生裁定 5、行 04 改引 §4.3（阶段 A→B 与 §4.7 分级对齐）、§2.2 行「§5.9」同改、需求引用消歧（§2/§6-5/§6-7）。**m-02 接受**：明色表补 `--pg-bg`/`--pg-elevated` 两行并纳入三处同源断言（§4.1）。**m-03 接受**：§6 改为「projectPath 自 V1 起仅参与检索、不在抽屉渲染，本次维持该口径」（补 `DetailDrawer.vue:216-223` 证据）。**m-04 接受**：§5.7 分区改五区、首区「应用与项目」含两行落位，§8.1 补「应用」「项目」键。**m-05 接受**：§10.4 补「双击页眉缩放行为确认可接受」，与 D-UI-A 判据对应。修订后状态仍为 PLAN_READY_FOR_REVIEW |
