# PortGate V1 需求就绪记录（PRD Ready Record）

- 需求文档：/Users/leiyu/code/github/PortGate/docs/software-company/prd/portgate-requirements-v1.1.md
- SHA-256：2ee93772051e159204209d978a7ca456a17d9f8e59e2422c6f65cdaa7f531e3d（已实际核验一致）
- 就绪结论：**PRD_READY**
- 结论日期：2026-09-22
- 记录人：产品经理 许清楚（software-product-manager）

---

## 1. 就绪检查摘要

| 检查维度 | 结论 |
|---|---|
| 目标用户 / 使用场景 | 明确：本机多端口开发者（Modern Developer Utility），核心场景"看清每个端口是谁开的、安全结束用户进程" |
| 范围与非范围 | 明确：第 27 节 V1 必做清单 + 第 28 节暂不做清单 + 第 29 节版本路线，边界清晰 |
| 关键流程 | 明确：扫描→Diff→事件推送（§19）、搜索 AND + 权重 + 高亮（§4）、PID→PPID 应用识别（§9.1）、目录 marker 项目识别（§9.2）、安全 Kill 校验链（§15/§17） |
| 验收标准可判定性 | 可判定：第 31 节五组标准均可改写为可执行验收项（见第 3 节） |
| 用户可见行为 | 明确：首页列表 + 统一搜索 + 详情 Drawer + 历史 Tab + 明暗双主题（§3/§5/§11/§23） |
| 接口与数据语义 | 明确：PortRecord/ProcessInfo/ApplicationInfo/ProjectInfo 模型（§8）、PlatformAdapter 接口（§13）、IPC 白名单（§18）、port_session 表结构（§10.2）、时间字段定义（§6） |
| 技术与运行限制 | 已确认：Electron + Vue3 + TypeScript + Vite + Pinia + Ant Design Vue + Less + better-sqlite3 + electron-builder；macOS 优先完整实现，Win/Linux 仅预留 Adapter 接口 |
| 项目事实 | 全新空壳仓库（仅 README/LICENSE/.gitignore），无既有实现约束冲突 |
| 自相矛盾 / 关键歧义 | 未发现阻断性矛盾；存在 8 处需记录口径的解释性裁定（见第 5 节 R-01~R-08），均有文档内一致读法，不阻断开工 |

---

## 2. V1 范围内必须完成（§27 摘录，作为验收对照基线）

TCP LISTEN 与 UDP；Port/Protocol/Address/State；PID/PPID、Process、Executable、Command、User、Working Directory、Start Time、Uptime；Application Resolver；Project Resolver；Local/Exposed 判定；Protection Level；统一搜索（多关键词 AND、Search Score、Highlight）；安全 Terminate；SQLite + Port Session + History；Light/Dark 双主题；macOS Adapter 完整实现；Windows/Linux Adapter 接口预留。

---

## 3. V1 可执行验收清单

> 提取自需求文档第 31 节，按"前置 / 动作 / 期望 / 验证方式"改写。标注说明：[自动化可测] = 单元测试 / 组件测试 / 架构测试可覆盖；[人工/打包验证] = 依赖真实系统环境或安装包产物，需真机或 CI 产物验证。
> 编号前标（来源）表示该条对应的需求章节。

- **AC-01 统一搜索多关键词 AND 命中**（§31 搜索）
  - 前置：存在满足 Port=5173、ProcessName=node、ProjectName 含 buddy（如 ci-buddy）的端口记录；另备缺任一关键词的干扰记录。
  - 动作：搜索框输入 `5173 node buddy`。
  - 期望：仅三个关键词全部命中（允许各关键词命中不同字段，如 node→进程、5173→端口、buddy→项目名/路径）的记录出现在"当前"结果中；缺任一关键词的记录被排除。
  - 验证方式：[自动化可测]（SearchEngine 单元测试，含字段分布命中与负向排除用例；真机冒烟并入 AC-04）。

- **AC-02 搜索命中高亮**（§31 搜索、§4.4）
  - 动作：同 AC-01 查询，检查结果各列渲染。
  - 期望：端口列 `5173`、进程列 `node`、项目名 `ci-[buddy]`、路径中 `/Users/.../ci-[buddy]` 均高亮；高亮统一由 HighlightText 组件实现，各列不得重复实现。
  - 验证方式：[自动化可测]（HighlightText 组件测试断言分段与关键词覆盖）。

- **AC-03 搜索权重排序**（§27 Search Score、§4.3）
  - 前置：构造 Port=3000 精确记录一条、command 含 "3000" 的记录一条。
  - 动作：搜索 `3000`。
  - 期望：Port 精确命中排在 command 包含命中之前（Port/PID 精确 > 名称精确 > 名称包含 > 命令/路径包含）。
  - 验证方式：[自动化可测]（评分/排序单元测试）。

- **AC-04 真机端口关联信息完整性**（§31 端口关联）
  - 前置：macOS 真机启动用户开发进程监听端口（如 node/python 简易 server）。
  - 动作：在列表定位该端口，打开详情 Drawer。
  - 期望：Port、PID、Process、Command、Working Directory、Application、Project、Start Time、Uptime、Exposure 十项全部可见，数值与 `lsof`/`ps` 输出一致；Application/Project 按 §9 尽力识别，确无 marker 时允许为空但字段位保留（口径见 R-03）。
  - 验证方式：[人工/打包验证]（真机冒烟 + 与系统命令人工核对）。

- **AC-05 Application Resolver 进程树解析**（§9.1、§31 端口关联）
  - 动作：以进程树 fixture（node→npm→zsh→iTerm2）调用 resolver。
  - 期望：沿 PID→PPID 向上递归定位宿主 GUI 应用，正确返回应用名及可取得的 bundleId/path。
  - 验证方式：[自动化可测]（fixture 单元测试）。

- **AC-06 Project Resolver 项目识别**（§9.2、§31 端口关联）
  - 动作：临时目录构造 marker 层级（package.json(name=ci-buddy-web)、pom.xml、.git 等），令进程 Working Directory 位于其子目录后调用 resolver。
  - 期望：向上找到最近 marker 目录，正确返回项目名与路径；无 marker 时返回空。
  - 验证方式：[自动化可测]（临时目录 fixture 单元测试）。

- **AC-07 Exposure 判定**（§7、§31 端口关联）
  - 动作：构造 localAddress 分别为 127.0.0.1、::1、0.0.0.0、:: 的记录。
  - 期望：127.0.0.1/::1 判为 Local（仅本机）；0.0.0.0/:: 判为 Exposed（对外监听）；顶部统计条 Exposed 计数与列表一致。
  - 验证方式：[自动化可测]。

- **AC-08 KillPolicy 校验与拒绝矩阵**（§15/§16/§17、§31 安全结束）
  - 动作：单元级模拟 terminate(recordId) 全链路：按 recordId 取当前快照→重读 PID→校验 Process Start Time→校验 Executable→重算 ProtectionLevel。
  - 期望：USER 放行；SYSTEM / SYSTEM_CRITICAL / UNKNOWN 一律拒绝；PID 复用场景（同 PID 但 startTime 或 executable 不一致）拒绝；Renderer 侧仅存在 recordId 维度 IPC（port:terminate / port:forceTerminate），不存在 kill(pid) 通道。
  - 验证方式：[自动化可测]（含 PID 复用用例；IPC 白名单以代码断言 + 评审抽查）。

- **AC-09 真机普通用户进程安全终止闭环**（§31 安全结束）
  - 前置：真机启动用户进程占用某端口。
  - 动作：列表/详情点击"结束进程"并确认。
  - 期望：进程被 SIGTERM 正常终止；端口随下一轮扫描从列表消失；对应 port_session 的 closed_at 正确写入、last_seen_at 停止更新。
  - 验证方式：[人工/打包验证]。

- **AC-10 系统进程保护**（§31 安全结束、§16）
  - 动作：对 SYSTEM / SYSTEM_CRITICAL 进程（如 /System/、/usr/sbin/ 路径下进程）尝试结束。
  - 期望：界面明确提示 System Protected，终止被拒绝，进程保持运行；UNKNOWN 级别默认禁止。
  - 验证方式：[人工/打包验证]（分类规则由 AC-08 自动化并行覆盖）。

- **AC-11 强制结束兜底**（§17/§18，终止能力的组成部分）
  - 动作：对忽略 SIGTERM 的用户进程先走正常结束，失败后按流程选择强制结束。
  - 期望：正常结束失败后应用提供强制结束选项；SIGKILL 成功后列表与 Session 同步更新。
  - 验证方式：[人工/打包验证]。

- **AC-12 历史会话数据与检索**（§31 历史、§11）
  - 动作：自动化写入 port_session 并标记关闭，再按端口 / 进程 / 项目关键词检索并切换"历史"Tab。
  - 期望：已关闭端口仍可被搜索命中，且能回答：何时出现（first_seen_at）、何时结束（closed_at）、哪个进程、哪个项目、占用多久（closed_at − first_seen_at）。
  - 验证方式：[自动化可测]（SQLite 读写与查询单测，UI 以 fixture 数据驱动）。

- **AC-13 真机历史闭环**（§31 历史）
  - 动作：真机起停一个真实端口进程后再次搜索该端口。
  - 期望：历史 Tab 出现该会话，时间区间与时长展示正确（形如 `17:30 - 18:42 · 1h12m`）。
  - 验证方式：[人工/打包验证]。

- **AC-14 macOS .dmg 打包与安装启动**（§31 打包、§21）
  - 动作：electron-builder 构建 mac 目标，安装 .dmg 并启动应用。
  - 期望：可安装、可启动；端口扫描与 SQLite 历史写入正常（验证 better-sqlite3 已按 Electron ABI 正确 rebuild）。
  - 验证方式：[人工/打包验证]。

- **AC-15 Windows / Linux 构建产物**（§31 打包、§22）
  - 动作：经 GitHub Actions 矩阵（windows-latest / ubuntu-latest）或本地等效构建。
  - 期望：产出 PortGate-Setup.exe（NSIS）、.AppImage、.deb 至少各一份。
  - 验证方式：[人工/打包验证]（V1 只验收产物可产出；Win/Linux 真机功能验收留待 V1.2，口径见 R-01）。

- **AC-16 平台逻辑架构隔离**（§31 打包、§12/§13）
  - 动作：静态检查 UI / 搜索 / SQLite / Kill 等业务层代码。
  - 期望：平台相关逻辑全部收敛于 PlatformAdapter 实现类（MacAdapter 等）；业务层不出现 lsof/ps/netstat 直接调用，不散布 process.platform 分支；Adapter 经统一接口注入。
  - 验证方式：[自动化可测]（ESLint 边界规则 / 依赖检查 + 架构测试，辅以代码评审）。

验收覆盖对照：§31 搜索 → AC-01/02/03；端口关联 → AC-04~07；安全结束 → AC-08~11；历史 → AC-12/13；打包 → AC-14~16。第 31 节五组标准全部覆盖，无遗漏。

---

## 4. V1 范围外清单（防止范围蔓延）

### 4.1 明确不做（§28）

- 抓包 / Packet Inspection
- 防火墙
- 自动封禁
- 完整网络流量分析
- 云同步
- 远程电脑
- 账号系统

### 4.2 属后续版本，V1 不得顺带实现（§29 路线图反推）

- V1.1 项：独立 History Page（注意：V1 仅做搜索结果内"当前/历史"切换，见 R-02）、Port Timeline、Favorite Port、Ignore Rule、Custom Protection Rule、macOS Menu Bar
- V1.2 项：Windows Adapter 完整实现、Linux Adapter 完整实现、Docker 深度识别、项目识别增强、端口冲突检测
- V2 项：Last Network Activity / Last Active、RX/TX、Connection Count、Project View、端口时间线页面、端口变化提醒
- 其他：§4.5 高级搜索语法（port:5173、pid:… 等）；§6 明确 V1 不做网络活跃时间（Last Seen 不等于 Last Active）；§22 正式发布的签名与公证（Developer ID / Notarization / Code Signing）不属 V1 验收（见 R-08）

---

## 5. 解释性裁定（口径记录，非澄清问题）

以下条目在文档内均有可一致解读的口径，已按下列读法固定，供架构 / 工程 / QA 直接执行，不作为 NEEDS_USER_CLARIFICATION 事项：

- **R-01 三平台打包 vs Win/Linux Adapter 仅预留接口**（§27 vs §31）：V1 必须能产出三平台安装包（electron-builder 配置 + CI 矩阵）；功能完整度以 macOS 为准，Windows/Linux 产物允许因 Adapter 未实现而功能降级，V1 不要求 Win/Linux 真机功能验收（V1.2 补齐）。
- **R-02 History（V1）vs History Page（V1.1）**：V1 交付 §11 所述搜索结果内"当前 / 历史"切换与历史会话检索（§31 历史标准对应此能力）；独立历史页面属 V1.1。
- **R-03 Application / Project 字段尽力识别**：§2"识别 / 尽可能识别"、§9 机制均为尽力而为；验收口径 = 字段位可见 + 可识别场景下正确（AC-05/06），不可识别时允许为空。
- **R-04 Docker 关联**：§9.3 为"尽量关联"，V1 尽力而为、不作验收阻断项；深度识别属 V1.2。数据模型 container 字段保持 optional。
- **R-05 CPU / Memory Runtime 字段**：§5 Drawer 草图含 Runtime 区，但 §27 必做清单与 §31 均未列入；作为低成本可选增强（macOS ps 可提供），不入 V1 验收。
- **R-06 收藏 / 忽略 / 自定义保护数据表**（§10.3）：对应功能属 V1.1；V1 是否预建表由架构师裁量，无 UI、不入验收。
- **R-07 主题切换方式**：文档未规定手动/跟随系统；建议手动切换并默认跟随系统，属非阻断 UI 细节，由设计实现阶段决定。
- **R-08 图标与签名**：应用图标 V1 先用占位图，正式图标由外部流程约 3 小时后生成再集成（已确认事实）；§22 签名/公证仅约束"正式发布"，V1 产物允许未签名。

## 6. 澄清问题清单

**无。** 未发现"不澄清就无法开工"的关键歧义。

已确认且不再列为问题的事实：由交付团队自主执行开发；每阶段完成后由主理人使用 smart-commit 提交（用户已授权提交）；应用图标先用占位图，3 小时后由外部流程生成正式图标再集成。

## 7. 下游交接

本记录与需求文档共同作为架构设计（software-architect）的输入。开发顺序建议遵循需求文档第 30 节（Electron 基础工程 → PlatformAdapter → MacAdapter → … → GitHub Actions；Windows/Linux Adapter 实现排最后，对应 V1.2）。
