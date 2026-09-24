# PortGate
本机端口、进程、应用、项目之间的可视化监控与安全管理工具

## 本地开发

```bash
npm install
npm run dev
```

## 测试与检查

```bash
npm test            # vitest 单元测试（解析器/搜索/KillPolicy/SessionStore/白名单与契约等）
npm run lint        # ESLint（含 AC-16 边界守护规则）
npm run typecheck   # tsc / vue-tsc
```

## 包管理器

- **npm**（主包管理器）：依赖锁定在 `package-lock.json`，CI 使用 `npm ci`。
- **pnpm** 亦受支持：`pnpm-workspace.yaml` 已配置 `allowBuilds` 构建脚本白名单（better-sqlite3/esbuild/core-js/electron-winstaller）与 `nodeLinker: hoisted`（electron-builder 兼容）。直接 `pnpm pack:mac` / `pnpm pack:win` 即可。
- 两种包管理器**不要混装**同一 `node_modules`：切换时先 `rm -rf node_modules` 再安装。

## 打包（electron-builder）

```bash
npm run pack:mac             # macOS 双架构（Apple Silicon + Intel 各一个 .dmg）
npm run pack:win             # Windows .exe（NSIS；mac 上可交叉构建，CI 原生构建）
npx electron-builder --linux AppImage deb --publish never   # Linux（CI 或按需）
npm run dist                 # 兼容别名：当前平台打包（等价 build + electron-builder）
```

> **⚠️ 务必用 `npm run dist`（或先 `npm run build`）**：electron-builder 只打包 `out/` 里
> 已有的构建产物，自己不会构建。源码更新后若直接 `npx electron-builder`，会把**过期的
> 旧界面**打进安装包（症状：新窗口行为 + 旧 UI、文案缺失等）。`npm run dist` =
> `npm run build && electron-builder`，始终打包最新源码。
> 打包后自检：dmg 内 `app.asar` 应包含 `pg-th`/「应用与项目」等新标记、不含 `Cloud Slate` 旧标记：
> `grep -ac "pg-th" dist/mac-arm64/PortGate.app/Contents/Resources/app.asar`（挂载 dmg 后路径同理）。

未签名口径（R-07/R-08，方案 m-07）：

- macOS 构建固定 `identity: null`，且打包命令环境带 `CSC_IDENTITY_AUTO_DISCOVERY=false`，杜绝证书存在时被自动签名。
- 首次打开未签名 dmg 内的应用被 Gatekeeper 拦截时，任选其一：
  - 右键点击 `PortGate.app` → 「打开」→ 再点「打开」；
  - 或终端执行 `xattr -cr /Applications/PortGate.app` 后正常打开。

网络受限/离线打包（Electron 二进制下载被重置时）：

electron-builder 每次打包都会拉取 Electron 发行 zip，弱网环境下可能报
`The server aborted pending request`。`npm run dist`（及 `pack:mac` / `pack:win`）会自动加载本地 `.env`
（不入库；模板见 `.env.example`，复制后取消注释即可）。

```bash
# 方式一（推荐先试）：.env 里设镜像源后直接打包（npm run pack:mac / pack:win / dist）
#   .env: ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm run dist

# 方式二：完全离线——用本机已缓存的 Electron zip（首次需解压一次）
ZIP=~/Library/Caches/electron/bb424f9061e7a2927a7fcc04709593fe81ac4633e2cd40456f2ef431743b1ee7/electron-v44.4.3-darwin-arm64.zip
DIST=~/Library/Caches/electron/portgate-dist/darwin-arm64
mkdir -p "$DIST" && unzip -oq "$ZIP" -d "$DIST"
npx electron-builder --mac dmg --arm64 --publish never -c.electronDist="$DIST"
```

`electronDist` 仅作为命令行覆盖传入，不写入仓库配置（避免影响 CI 下载官方源）。

## CI

`.github/workflows/build.yml`：push 触发三平台矩阵（macOS / Windows / Ubuntu）——
`npm ci → npm test → typecheck → lint → build → electron-builder` 出对应产物
（mac `.dmg` / Windows `.exe` / Linux `.AppImage` + `.deb`）并上传 artifacts；
`CSC_IDENTITY_AUTO_DISCOVERY=false`，无签名无公证步骤。

## 技术栈

Electron + Vue 3 + TypeScript + Vite（electron-vite）+ Pinia + Ant Design Vue + Less +
better-sqlite3（包内 N-API 预编译，无 rebuild）+ electron-builder + vitest。
