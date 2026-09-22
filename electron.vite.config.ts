import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import { CSP_DEV, CSP_PROD } from './src/shared/constants'

/**
 * CSP 注入插件（方案 §3.3 / v1.2 m-06 定稿：dev 与 prod 均注入 CSP meta）。
 * - dev：完整指令集 + connect-src 'self' ws:（放行 Vite HMR WebSocket）
 * - prod：完整指令集（见 src/shared/constants.ts 定稿记录）
 */
function cspInjectionPlugin(): Plugin {
  return {
    name: 'portgate:csp-injection',
    transformIndexHtml(html, ctx) {
      const csp = ctx.server ? CSP_DEV : CSP_PROD
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: csp
            },
            injectTo: 'head-prepend'
          }
        ]
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [vue(), cspInjectionPlugin()],
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
          // 为每段 Less（SFC 样式 / themes.less / base.less）注入主题变量表（reference 不产生重复输出）
          additionalData: `@import (reference) "${resolve(__dirname, 'src/renderer/styles/variables.less')}";`
        }
      }
    }
  }
})
