/**
 * PortGate ESLint flat config（方案 §3.1：eslint9 + eslint-plugin-vue + typescript-eslint）。
 * 承担 AC-16 架构边界守护（方案 §3.3 / §8.3）：
 *  1) Renderer 禁止导入 Node 内建模块与 electron、禁止 Node 全局（require/process/Buffer 等）；
 *  2) preload 仅允许 electron 桥 API，禁止 Node 内建模块；
 *  3) process.platform 仅允许出现在 src/main/platform/（平台分支唯一合法位置；目录阶段 2 建立，
 *     规则阶段 1 先行就位，防止边界回退）。
 * 导出 Promise 形式的 flat config（ESLint 9 支持），以同时兼容 ESM-only 的插件包。
 */
module.exports = (async () => {
  const tseslint = await import('typescript-eslint')
  const pluginVue = (await import('eslint-plugin-vue')).default

  const NODE_BUILTIN_GROUPS = [
    'node:*',
    'node:**',
    'fs',
    'path',
    'os',
    'crypto',
    'http',
    'https',
    'net',
    'tls',
    'dns',
    'util',
    'assert',
    'stream',
    'url',
    'zlib',
    'child_process',
    'worker_threads',
    'readline',
    'perf_hooks'
  ]

  return tseslint.config(
    {
      name: 'portgate/ignores',
      ignores: ['node_modules/**', 'out/**', 'dist/**', 'coverage/**']
    },
    ...tseslint.configs.recommended,
    ...pluginVue.configs['flat/recommended'],
    {
      name: 'portgate/unused-vars',
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
        ]
      }
    },
    {
      name: 'portgate/vue-ts-parser',
      files: ['src/renderer/**/*.vue'],
      languageOptions: {
        parserOptions: {
          parser: tseslint.parser,
          sourceType: 'module',
          ecmaVersion: 'latest'
        }
      }
    },
    {
      name: 'portgate/renderer-boundary',
      files: ['src/renderer/**/*.{ts,vue}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: NODE_BUILTIN_GROUPS,
                message:
                  'AC-16：Renderer 禁止导入 Node 内建模块，平台能力只能经 window.portgate 白名单桥获取（方案 §3.2/§3.3）'
              },
              {
                group: ['electron', 'electron/**'],
                message:
                  'AC-16：Renderer 禁止直接导入 electron，一切平台能力经 window.portgate 白名单桥获取'
              }
            ]
          }
        ],
        'no-restricted-globals': [
          'error',
          { name: 'require', message: 'Renderer 运行于 sandbox，禁止 require' },
          { name: 'process', message: 'Renderer 运行于 sandbox，禁止 process' },
          { name: 'Buffer', message: 'Renderer 运行于 sandbox，禁止 Buffer' },
          { name: 'global', message: 'Renderer 禁止使用 global' },
          { name: '__dirname', message: 'Renderer 禁止使用 __dirname' },
          { name: '__filename', message: 'Renderer 禁止使用 __filename' }
        ]
      }
    },
    {
      name: 'portgate/preload-boundary',
      files: ['src/preload/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: NODE_BUILTIN_GROUPS,
                message: 'preload 仅允许 electron 桥 API，禁止 Node 内建模块（方案 §4.3）'
              }
            ]
          }
        ]
      }
    },
    {
      name: 'portgate/platform-boundary',
      files: ['src/main/**/*.ts'],
      ignores: ['src/main/platform/**'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'process',
            property: 'platform',
            message:
              'AC-16：process.platform 仅允许出现在 src/main/platform/（平台分支唯一合法位置，方案 §5.2）'
          }
        ]
      }
    },
    {
      name: 'portgate/app-naming',
      files: ['src/renderer/App.vue'],
      rules: {
        'vue/multi-word-component-names': 'off'
      }
    }
  )
})()
