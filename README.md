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

## CI

`.github/workflows/build.yml`：push 触发三平台矩阵（macOS / Windows / Ubuntu）——
`npm ci → npm test → typecheck → lint → build → electron-builder` 出对应产物
（mac `.dmg` / Windows `.exe` / Linux `.AppImage` + `.deb`）并上传 artifacts；
`CSC_IDENTITY_AUTO_DISCOVERY=false`，无签名无公证步骤。

## 技术栈

Electron + Vue 3 + TypeScript + Vite（electron-vite）+ Pinia + Ant Design Vue + Less +
better-sqlite3（包内 N-API 预编译，无 rebuild）+ electron-builder + vitest。
