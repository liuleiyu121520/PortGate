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

## 打包（electron-builder）

```bash
npm run dist                 # 当前平台打包（macOS 产出 .dmg，输出到 dist/）
npx electron-builder --mac dmg --publish never
npx electron-builder --win nsis --publish never     # Windows（CI 或具备 wine 的环境）
npx electron-builder --linux AppImage deb --publish never
```

未签名口径（R-07/R-08，方案 m-07）：

- macOS 构建固定 `identity: null`，且打包命令环境带 `CSC_IDENTITY_AUTO_DISCOVERY=false`，杜绝证书存在时被自动签名。
- 首次打开未签名 dmg 内的应用被 Gatekeeper 拦截时，任选其一：
  - 右键点击 `PortGate.app` → 「打开」→ 再点「打开」；
  - 或终端执行 `xattr -cr /Applications/PortGate.app` 后正常打开。

网络受限/离线打包（Electron 二进制下载被重置时）：

electron-builder 每次打包都会拉取 Electron 发行 zip，弱网环境下可能报
`The server aborted pending request`。`npm run dist` 会自动加载本地 `.env`
（不入库；模板见 `.env.example`，复制后取消注释即可）。

```bash
# 方式一（推荐先试）：.env 里设镜像源后直接打包
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
