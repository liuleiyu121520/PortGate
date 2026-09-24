#!/usr/bin/env node
/**
 * 统一打包入口：优先使用本机 Electron 缓存（离线出包），缓存缺失时回退在线下载（.env 的 ELECTRON_MIRROR 生效）。
 *
 * 用法（package.json scripts）：
 *   node --env-file-if-exists=.env scripts/pack.js mac   # arm64 + x64 双架构 dmg
 *   node --env-file-if-exists=.env scripts/pack.js win   # Windows NSIS（mac 可交叉构建）
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const target = (process.argv[2] || 'mac').toLowerCase();
const electronPkg = require('../node_modules/electron/package.json');
const electronVersion = electronPkg.version;

const home = os.homedir();
// @electron/get 缓存根目录（npm/pnpm 安装 electron 时下载的 zip 都落在这里，按内容哈希分子目录）
const cacheRoot = path.join(home, 'Library', 'Caches', 'electron');
const distRoot = path.join(cacheRoot, 'portgate-dist');

const TARGETS = {
  mac: [
    { platform: 'darwin', arch: 'arm64' },
    { platform: 'darwin', arch: 'x64' },
  ],
  win: [
    { platform: 'win32', arch: 'x64' },
  ],
};

if (!TARGETS[target]) {
  console.error(`[pack] 未知目标：${target}（可选 mac | win）`);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function findCachedZip(platform, arch) {
  const name = `electron-v${electronVersion}-${platform}-${arch}.zip`;
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ensureDist(platform, arch) {
  const dest = path.join(distRoot, `${platform}-${arch}`);
  const marker = platform === 'darwin' ? 'Electron.app' : 'electron.exe';
  if (fs.existsSync(path.join(dest, marker))) return dest;
  const zip = findCachedZip(platform, arch);
  if (!zip) return null;
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('unzip', ['-oq', zip, '-d', dest]);
  if (r.status !== 0) return null;
  console.log(`[pack] 已从本机缓存解压 Electron v${electronVersion} ${platform}-${arch}`);
  return dest;
}

// 1) 构建主进程/preload/renderer 到 out/
run('npm', ['run', 'build']);

// 2) 逐架构打包：本机缓存优先（离线），缺失才走在线下载
for (const { platform, arch } of TARGETS[target]) {
  const args = ['node_modules/electron-builder/cli.js', '--publish', 'never'];
  if (target === 'mac') args.push('--mac', 'dmg', `--${arch}`);
  else args.push('--win', 'nsis');

  const dist = ensureDist(platform, arch);
  if (dist) {
    args.push(`-c.electronDist=${dist}`);
    console.log(`[pack] ${platform}-${arch}：使用本机 Electron 缓存（离线）`);
  } else {
    console.log(`[pack] ${platform}-${arch}：本机缓存缺失，回退在线下载（ELECTRON_MIRROR 生效）`);
  }
  run('node', args);
}

console.log(`[pack] ${target} 完成 ✔`);
