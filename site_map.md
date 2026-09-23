# Site Map

## 概览

- 待补充项目整体结构、核心页面、核心模块与主要业务流。

## 待确认更新

### [2026-09-23 01:32] feat(scaffold): 搭建 PortGate 工程脚手架与安全骨架（阶段1）

- 新增 PortGate 桌面应用：Electron 三端工程结构、IPC 白名单契约、双主题壳；入口 src/main/index.ts，渲染层 src/renderer，测试 tests/unit

## 待确认更新

### [2026-09-23 02:11] feat(platform): 实现 MacAdapter 扫描流水线与 Diff 引擎（阶段2）

- 新增平台适配层（src/main/platform：MacAdapter 完整实现，Win/Linux 预留）与核心引擎（src/main/core/port：扫描/Diff/内存仓），IPC 白名单扩至 6 通道

## 待确认更新

### [2026-09-23 03:00] feat(ui): 实现统一搜索、命中高亮与端口详情 Drawer（阶段3）

- 新增搜索域（src/main/core/search：引擎/字段表/高亮函数）与渲染组件（SearchBar/HighlightText/DetailDrawer）

## 待确认更新

### [2026-09-23 03:33] feat(security): 实现 Resolver 链与安全 Kill 闭环（阶段4）

- 新增识别域（src/main/core/resolve：应用/项目/容器）与安全域（src/main/core/security：分类器/终止状态机），IPC 白名单扩至 9 通道

## 待确认更新

### [2026-09-23 04:07] feat(storage): 实现 SQLite 持久化、历史会话与设置存储（阶段5）

- 新增持久化域（src/main/db + core/store：SessionStore/SettingsStore），IPC 白名单扩至 10 通道（port:history 历史检索）

## 待确认更新

### [2026-09-23 04:30] feat(build): 完成打包配置、三平台 CI 与主题走查（阶段6）

- 新增 CI 工作流与四平台打包配置；非 macOS 平台显示降级横幅（V1.2 完整适配）

## 待确认更新

### [2026-09-23 19:22] feat(ui): 落地 Apple 设计风格重构与高密度桌面数据布局

- 全面落地 Apple 设计风格视觉规范：重构渲染层设计令牌、高密度主表格与交互微反馈；新增文案规范域（src/renderer/copy.ts）、原生窗口外观配置（src/main/platform/window.ts）与 5 套测试套件

## 待确认更新

### [2026-09-24 01:29] feat(ui): 指标标签中英双语标注与文档收口（V1.1 UI 增量）

- UI 增量：数据指标标签双语体系（copy.ts 单一来源 + copy-contract 断言）；文档面新增 UI 重构方案/需求/盘点三份控制面文档
