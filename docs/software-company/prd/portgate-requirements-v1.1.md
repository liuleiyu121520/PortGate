# PortGate（端口门禁）完整产品与技术方案

> 版本：V1.1  
> 产品形态：Electron 桌面应用  
> 平台策略：跨平台架构，macOS 优先实现，兼容 Windows / Linux  
> 核心定位：本机端口、进程、应用、项目之间的可视化监控与安全管理工具

---

# 1. 产品定义

## 1.1 产品名称

**英文名：PortGate**  
**中文名：端口门禁**

副标题：

> Local Port & Process Guard

产品一句话：

> 看清每一个端口是谁打开的，并安全管理对应进程。

PortGate 不只是 `lsof` / `netstat` 的图形界面，而是建立：

```text
端口
  ↓
Socket
  ↓
PID
  ↓
Process
  ↓
Executable / Command
  ↓
Application
  ↓
Project
  ↓
History
  ↓
Safe Control
```

之间的关系。

---

# 2. 核心能力

V1 聚焦以下能力：

- 实时查看 TCP / UDP 端口
- 查看端口对应 PID、进程、启动命令、工作目录、用户
- 识别进程所属桌面应用
- 尽可能识别所属开发项目
- 查看进程启动时间、运行时长、端口首次发现时间、最后检测时间
- 判断端口是否仅本机监听或对外监听
- 统一搜索端口、PID、进程、应用、项目、路径、命令等信息
- 多关键词联合检索
- 搜索结果命中高亮
- 安全结束用户进程
- 系统进程保护
- SQLite 保存端口历史与状态变化
- 支持 macOS / Windows / Linux 平台适配

---

# 3. 产品界面

主界面保持简单：

```text
┌──────────────────────────────────────────────────────────────┐
│ PortGate · 端口门禁                           ● Monitoring   │
├──────────────────────────────────────────────────────────────┤
│ 🔍 搜索端口、PID、进程、应用、项目、路径、命令……           │
│                                                              │
│ 46 Ports    TCP 38    UDP 8    Exposed 5                   │
├──────────────────────────────────────────────────────────────┤
│ PORT │ PROCESS │ APP │ PROJECT │ ADDRESS │ UPTIME │ ACTION │
│ 5173   node      iTerm ci-buddy 127.0.0.1 1h23m            │
│ 3000   node      iTerm admin    0.0.0.0   2h15m            │
│ 3306   Docker    Docker mysql   0.0.0.0   6h12m            │
│ 8080   java      IDEA api       127.0.0.1 5h33m            │
└──────────────────────────────────────────────────────────────┘
```

列表只展示高频信息，完整信息放在右侧详情 Drawer。

---

# 4. 统一搜索

整个产品只保留一个搜索框。

支持：

```text
5173
node
5173 node
node buddy
5173 node buddy
docker mysql
java gateway
0.0.0.0 node
```

## 4.1 搜索规则

空格表示 AND：

```text
node 5173 buddy
```

等价于：

```text
node
AND 5173
AND buddy
```

但每个关键词可以命中不同字段：

```text
processName = node
localPort = 5173
projectName = ci-buddy
```

仍视为命中。

逻辑：

```text
(keyword1 命中任意字段)
AND
(keyword2 命中任意字段)
AND
(keyword3 命中任意字段)
```

## 4.2 可检索字段

至少包括：

```text
Port
Protocol
State
Local Address
Remote Address
PID
PPID
Process Name
Executable Path
Command Line
User
Application Name
Project Name
Project Path
Working Directory
Container Name
Docker Image
Protection Level
```

## 4.3 搜索权重

建议：

| 优先级 | 匹配类型 |
|---|---|
| 最高 | Port / PID 精确匹配 |
| 高 | Process / App / Project 精确匹配 |
| 中 | Process / App / Project 包含匹配 |
| 低 | Command / Path / Executable 包含匹配 |

例如搜索 `3000`，真正的 `Port = 3000` 应排在 `command contains 3000` 前面。

## 4.4 命中高亮

搜索：

```text
5173 node buddy
```

结果中：

```text
[5173]
[node]
ci-[buddy]
/Users/.../ci-[buddy]
```

都需要高亮。

统一由 `HighlightText` 组件处理，不在各列重复实现。

## 4.5 高级语法

后续可以增加：

```text
port:5173
pid:63214
process:node
app:docker
project:buddy
state:listen
expose:public
```

普通用户仍然只需要直接输入关键词。

---

# 5. 端口详情

点击一条记录打开详情：

```text
5173
TCP · LISTEN

Process
node

Project
CI Buddy Web

Application
iTerm2

Network
Port            5173
Address         127.0.0.1
Protocol        TCP
State           LISTEN
Exposure        Local Only

Process
PID             63214
PPID            62982
User            user
Executable      /Users/.../node
Command         npm run dev
Working Dir     /Users/.../ci-buddy/apps/web

Time
Process Start   21:10:03
Uptime          1h23m
First Seen      21:10:06
Last Seen       22:33:11
Port Duration   1h23m

Runtime
CPU             2.3%
Memory          168 MB

[打开项目目录] [复制命令] [结束进程]
```

---

# 6. 时间字段定义

必须区分：

| 字段 | 含义 |
|---|---|
| Process Start | 操作系统记录的进程启动时间 |
| Uptime | 当前时间 - Process Start |
| First Seen | PortGate 第一次检测到该端口 |
| Last Seen | PortGate 最近一次确认端口仍存在 |
| Port Duration | 当前时间 - First Seen |

V1 不把 `Last Seen` 写成 `Last Active`。

真正的网络活跃时间需要网络事件或流量采集，后续版本再加入。

---

# 7. 端口暴露状态

识别：

```text
127.0.0.1
::1
```

显示：

```text
Local
仅本机
```

识别：

```text
0.0.0.0
::
```

显示：

```text
Exposed
对外监听
```

注意：`Exposed` 代表监听了非回环地址，不等于一定可以从公网访问。

---

# 8. 核心数据模型

```ts
interface PortRecord {
  id: string

  protocol: 'TCP' | 'UDP'

  localAddress: string
  localPort: number

  remoteAddress?: string
  remotePort?: number

  state?: string

  pid: number

  process: ProcessInfo
  application?: ApplicationInfo
  project?: ProjectInfo
  container?: ContainerInfo

  timing: TimingInfo
  security: SecurityInfo
  runtime?: RuntimeInfo
}
```

## ProcessInfo

```ts
interface ProcessInfo {
  pid: number
  ppid?: number

  name: string
  executablePath?: string
  commandLine?: string
  arguments?: string[]

  workingDirectory?: string

  user?: string
  uid?: number

  architecture?: string
  startedAt?: number
}
```

## ApplicationInfo

```ts
interface ApplicationInfo {
  name: string
  bundleId?: string
  path?: string
  icon?: string
  sourcePid?: number
}
```

## ProjectInfo

```ts
interface ProjectInfo {
  name?: string
  path?: string
  type?: string
  marker?: string
}
```

---

# 9. Application 与 Project 识别

## 9.1 Application Resolver

例如：

```text
node
 ↑
npm
 ↑
zsh
 ↑
iTerm2
```

最终识别：

```text
Application = iTerm2
```

通过 PID → PPID 递归向上查找宿主应用。

## 9.2 Project Resolver

根据 Working Directory 向父目录查找项目标识：

```text
package.json
pnpm-workspace.yaml
yarn.lock
pom.xml
build.gradle
settings.gradle
Cargo.toml
go.mod
pyproject.toml
requirements.txt
.git
```

Node 项目可以读取：

```json
{
  "name": "ci-buddy-web"
}
```

Java 项目可以读取：

```text
artifactId
rootProject.name
```

用于生成更准确的项目名称。

## 9.3 Docker

如果端口来自 Docker，尽量关联：

```text
Port
 ↓
Container
 ↓
Container Name
 ↓
Image
```

例如：

```text
3306
local-mysql
mysql:8.0
```

---

# 10. SQLite 设计

SQLite 不负责当前端口扫描。

当前数据来自：

```text
PlatformAdapter
 ↓
PortScanner
 ↓
Memory Store
 ↓
Renderer
```

SQLite 负责：

- 端口历史
- Port Session
- 状态变化
- 用户设置
- 收藏端口
- 忽略规则
- 自定义保护规则

推荐：

```text
better-sqlite3
```

## 10.1 写入原则

不要每隔 1~2 秒把完整端口数据写数据库。

只在：

```text
PORT_OPENED
PORT_CLOSED
PORT_CHANGED
PROCESS_CHANGED
```

时更新。

## 10.2 port_session

```sql
CREATE TABLE port_session (
  id TEXT PRIMARY KEY,

  protocol TEXT NOT NULL,

  local_address TEXT NOT NULL,
  local_port INTEGER NOT NULL,

  remote_address TEXT,
  remote_port INTEGER,

  state TEXT,

  pid INTEGER NOT NULL,
  ppid INTEGER,

  process_name TEXT NOT NULL,
  executable_path TEXT,
  command_line TEXT,
  working_directory TEXT,

  user_name TEXT,

  application_name TEXT,
  application_path TEXT,

  project_name TEXT,
  project_path TEXT,

  container_name TEXT,
  docker_image TEXT,

  protection_level TEXT,

  process_started_at INTEGER,

  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  closed_at INTEGER
);
```

## 10.3 其他表

```text
app_settings
favorite_port
ignore_rule
protection_rule
```

即可，不需要过度设计数据库。

---

# 11. 历史能力

搜索：

```text
8080 java
```

同时匹配：

```text
当前 PortRecord
+
历史 PortSession
```

页面可切换：

```text
当前 3
历史 24
```

历史记录展示：

```text
8080
java
api-server
17:30 - 18:42
1h12m
```

后续可以加入端口时间线。

---

# 12. 系统架构

```text
                   Electron
┌─────────────────────────────────────┐
│ Renderer                            │
│ Vue3 / Search / List / Detail       │
└──────────────────┬──────────────────┘
                   │ IPC
                   ↓
┌─────────────────────────────────────┐
│ Electron Main                       │
│                                     │
│ PortManager                         │
│ SearchEngine                        │
│ ProcessResolver                     │
│ ApplicationResolver                 │
│ ProjectResolver                     │
│ DockerResolver                      │
│ SecurityClassifier                  │
│ KillPolicy                          │
│ SessionManager                      │
│ SQLite                              │
└──────────────────┬──────────────────┘
                   │
                   ↓
┌─────────────────────────────────────┐
│ PlatformAdapter                     │
├─────────────┬─────────────┬─────────┤
│ MacAdapter  │ WinAdapter  │ Linux   │
└─────────────┴─────────────┴─────────┘
```

核心原则：

> 跨平台架构从第一天设计，macOS 先实现完整能力。

---

# 13. Platform Adapter

统一接口：

```ts
interface PlatformAdapter {
  scanPorts(): Promise<RawPort[]>

  getProcess(
    pid: number
  ): Promise<ProcessInfo | null>

  getProcessTree(
    pid: number
  ): Promise<ProcessInfo[]>

  terminateProcess(
    pid: number,
    force?: boolean
  ): Promise<void>

  getApplicationInfo?(
    pid: number
  ): Promise<ApplicationInfo | null>
}
```

运行时：

```ts
switch (process.platform) {
  case 'darwin':
    return new MacAdapter()

  case 'win32':
    return new WindowsAdapter()

  case 'linux':
    return new LinuxAdapter()
}
```

这样：

```text
UI
Search
SQLite
History
ProjectResolver
KillPolicy
```

都可以跨平台复用。

---

# 14. 各平台实现

## macOS

V1 可以先组合：

```text
lsof
ps
```

获取：

```text
Port
PID
PPID
Process
User
Command
Working Directory
Start Time
CPU
Memory
```

后续再换 Native Helper。

## Windows

初期可使用：

```text
PowerShell
netstat
```

正式版本逐步采用：

```text
GetExtendedTcpTable
GetExtendedUdpTable
OpenProcess
QueryFullProcessImageName
GetProcessTimes
TerminateProcess
```

## Linux

可以使用：

```text
/proc/net/tcp
/proc/net/tcp6
/proc/net/udp
/proc/<pid>/fd
/proc/<pid>/stat
/proc/<pid>/cmdline
```

也可结合：

```text
ss
ps
```

---

# 15. 安全 Kill

Renderer 不允许直接传 PID 执行 Kill。

不要设计：

```ts
kill(pid)
```

而是：

```ts
terminate(portRecordId)
```

Main Process 根据 `recordId`：

```text
找到当前快照
 ↓
重新读取 PID
 ↓
校验 Process Start Time
 ↓
校验 Executable
 ↓
重新计算 Protection Level
 ↓
允许后执行终止
```

这样可以避免 PID reuse 导致误杀。

---

# 16. Protection Level

```ts
enum ProtectionLevel {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
  SYSTEM_CRITICAL = 'SYSTEM_CRITICAL',
  UNKNOWN = 'UNKNOWN'
}
```

策略：

| 类型 | V1 行为 |
|---|---|
| USER | 允许结束 |
| SYSTEM | 禁止 |
| SYSTEM_CRITICAL | 禁止 |
| UNKNOWN | 默认禁止 |

系统判断不能只看 Process Name。

需要结合：

```text
PID
UID
User
Executable Path
Parent Process
System Path
Bundle
```

macOS 中：

```text
/System/
/usr/libexec/
/usr/sbin/
```

默认视为高风险。

---

# 17. Kill 流程

```text
用户点击结束
      ↓
读取 PortRecord
      ↓
重新读取 Process
      ↓
校验 PID
      ↓
校验 Start Time
      ↓
校验 Executable
      ↓
重新计算 Protection Level
      ↓
      USER？
   ↙       ↘
 YES        NO
 ↓           ↓
正常结束     拒绝
 ↓
再次扫描
 ↓
仍然存在？
 ↓
允许用户选择强制结束
```

macOS / Linux：

```text
SIGTERM
→ 必要时 SIGKILL
```

Windows：

```text
TerminateProcess
```

由平台 Adapter 处理。

---

# 18. Renderer 安全边界

Renderer 禁止直接：

```text
exec
spawn
kill
fs 任意访问
```

通过：

```text
preload
+
IPC
```

提供有限 API：

```text
port:list
port:detail
port:history
port:terminate
port:forceTerminate
port:refresh
port:events
```

---

# 19. 实时扫描与事件

默认扫描：

```text
2 秒
```

允许配置：

```text
1 秒
2 秒
5 秒
```

扫描后：

```text
Previous Snapshot
        +
Current Snapshot
        ↓
Diff Engine
        ↓
PORT_OPENED
PORT_CLOSED
PORT_CHANGED
PROCESS_CHANGED
```

Main 通过 IPC 推送变化，Renderer 局部更新，不整表刷新。

---

# 20. 技术栈

推荐：

```text
Electron
Vue 3
TypeScript
Vite
Pinia
Vue Router
Ant Design Vue
Less
better-sqlite3
electron-builder
```

---

# 21. 跨平台打包

构建目标：

```text
macOS
.dmg

Windows
.exe / NSIS

Linux
.AppImage / .deb
```

推荐使用：

```text
electron-builder
```

示例：

```json
{
  "build": {
    "appId": "com.portgate.app",
    "productName": "PortGate",

    "mac": {
      "target": ["dmg"]
    },

    "win": {
      "target": ["nsis"]
    },

    "linux": {
      "target": ["AppImage", "deb"]
    }
  }
}
```

`better-sqlite3` 属于 Native Node Module，需要针对 Electron ABI rebuild。

---

# 22. CI 跨平台构建

不建议依赖一台 Mac 交叉构建所有正式发行包。

推荐 GitHub Actions：

```text
macOS Runner
    ↓
PortGate.dmg

Windows Runner
    ↓
PortGate-Setup.exe

Ubuntu Runner
    ↓
PortGate.AppImage
PortGate.deb
```

矩阵：

```yaml
strategy:
  matrix:
    os:
      - macos-latest
      - windows-latest
      - ubuntu-latest
```

正式发布时：

- macOS：Developer ID + Notarization
- Windows：建议 Code Signing
- Linux：正常构建发行包

---

# 23. UI 主题

产品风格：

> Modern Developer Utility

关键词：

```text
专业
稳定
轻量
高信息密度
低干扰
技术感
```

避免：

```text
纯黑
黑客终端风
Cyberpunk
大量霓虹
传统系统工具风
```

## Light Theme：Cloud Slate

```text
Background    #F6F7F9
Surface       #FFFFFF
Border        #E7E9ED
Text          #1D2129
Secondary     #667085
Muted         #98A2B3
Accent        #4F6EF7
Success       #22A06B
Warning       #F59E0B
Danger        #E5484D
```

## Dark Theme：Midnight Slate

```text
Background    #17191D
Surface       #1E2126
Surface 2     #24282E
Border        #30343B
Text          #F2F4F7
Secondary     #A7ADB7
Accent        #6D85FF
```

不要使用纯黑背景。

---

# 24. 搜索框视觉

搜索框是首页核心控件：

```text
高度：44px
圆角：9px
左侧：Search Icon
右侧：⌘K
```

Placeholder：

```text
搜索端口、PID、进程、应用、项目、路径、命令…
```

支持：

```text
Command + K
```

快速聚焦。

---

# 25. 图标设计方向

核心概念：

```text
Gate
+
Port
+
Network Node
```

不要使用：

```text
锁
大盾牌
机器人
终端
代码括号
复杂电路板
文字
端口号数字
```

推荐图形：

```text
抽象门形
+
中心节点
+
两侧轻量连接路径
```

表达：

```text
Network Port
+
Gate Control
+
Process Relationship
```

---

# 26. 图标生成提示词

## 推荐版

```text
Design a premium macOS desktop application icon for a developer utility named "PortGate".

The product is a local port and process management tool that helps users inspect network ports, identify the process, application and project occupying each port, and safely terminate user processes.

Create a clean abstract symbol combining:
- a minimal gateway or doorway shape
- a central network port / node
- subtle connection paths suggesting processes and network relationships

The icon should communicate:
network ports, control, visibility, safety, developer productivity.

Visual style:
modern macOS utility app icon,
minimal geometric design,
soft depth,
subtle 3D layering,
rounded geometry,
professional and technical,
not playful,
not cyberpunk,
not hacker-style,
not overly futuristic.

Use a restrained blue-indigo palette with subtle cyan accents.
Background can use a soft slate-blue gradient.
The central symbol should remain recognizable at 16px, 32px, 64px and 512px.

Avoid:
padlocks,
large shields,
robots,
terminal windows,
code brackets,
text,
letters,
numbers,
glowing neon,
complex circuit boards.

No text.
Centered composition.
1024x1024.
```

## 极简版

```text
Create a minimal macOS app icon for a developer tool called PortGate.

Use an abstract gateway shape with one central network node and two subtle connection lines.

The icon represents local network ports, process relationships, visibility and control.

Style:
minimal geometric,
premium,
clean,
soft depth,
rounded corners,
blue-indigo and slate palette,
professional developer utility,
high readability at very small sizes.

Avoid shields, locks, robots, terminals, text, numbers and cyberpunk neon.

No text.
1024x1024.
```

---

# 27. V1 范围

V1 必须完成：

```text
TCP LISTEN
UDP

Port / Protocol / Address / State

PID / PPID
Process
Executable
Command
User
Working Directory
Start Time
Uptime

Application Resolver
Project Resolver

Local / Exposed
Protection Level

统一搜索
多关键词 AND
Search Score
Highlight

安全 Terminate

SQLite
Port Session
History

Light Theme
Dark Theme

macOS Adapter 完整实现
Windows / Linux Adapter 接口预留
```

---

# 28. V1 暂不做

暂不加入：

```text
抓包
Packet Inspection
防火墙
自动封禁
完整网络流量分析
云同步
远程电脑
账号系统
```

避免产品失焦。

---

# 29. 后续升级

## V1.1

```text
History Page
Port Timeline
Favorite Port
Ignore Rule
Custom Protection Rule
macOS Menu Bar
```

## V1.2

```text
Windows Adapter
Linux Adapter
Docker 深度识别
项目识别增强
端口冲突检测
```

## V2

```text
Last Network Activity
RX / TX
Connection Count
Project View
端口时间线
端口变化提醒
```

Project View 示例：

```text
CI Buddy

5173  Frontend
8080  API
3306  MySQL
6379  Redis
```

---

# 30. 推荐开发顺序

```text
1. Electron 基础工程
2. PlatformAdapter
3. MacAdapter
4. PortScanner
5. ProcessResolver
6. PortRecord
7. 首页列表
8. 统一搜索
9. 多关键词 AND
10. 命中高亮
11. Search Score
12. Process Tree
13. Application Resolver
14. Project Resolver
15. SecurityClassifier
16. KillPolicy
17. Diff Engine
18. SQLite
19. Port Session
20. History
21. Light / Dark Theme
22. electron-builder
23. GitHub Actions
24. Windows / Linux Adapter
```

---

# 31. V1 验收标准

## 搜索

输入：

```text
5173 node buddy
```

可以同时命中：

```text
Port = 5173
Process = node
Project = ci-buddy
```

并分别高亮。

## 端口关联

任意用户端口至少能看到：

```text
Port
PID
Process
Command
Working Directory
Application
Project
Start Time
Uptime
Exposure
```

## 安全结束

普通用户进程：

```text
重新验证进程
→ ProtectionLevel = USER
→ 正常终止
→ 更新 Port Session
```

系统进程：

```text
System Protected
```

禁止结束。

## 历史

端口关闭后仍可搜索：

```text
什么时候出现
什么时候结束
哪个进程
哪个项目
占用多久
```

## 打包

至少支持：

```text
macOS .dmg

Windows .exe

Linux .AppImage / .deb
```

架构上不允许平台逻辑散落到业务层。

---

# 32. 最终产品定义

PortGate 的核心不是：

> 漂亮版 `lsof`。

而是：

> **本机端口、进程、应用和开发项目之间的关系可视化与安全管理工具。**

核心链路：

```text
Port
 ↓
Process
 ↓
Application
 ↓
Project
 ↓
History
 ↓
Safe Control
```

用户看到一个端口时，应能立即回答：

```text
谁开的？
哪个进程？
哪个应用？
哪个项目？
什么时候开的？
运行多久？
是否对外？
以前谁用过？
能不能安全结束？
```

这就是 PortGate 的产品边界和核心价值。
