import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// 测试环境声明（方案 §3.1 / v1.2 m-02）：happy-dom + @vue/test-utils 供组件测试使用；
// vue 插件使 vitest 能编译 .vue SFC（HighlightText 组件测试）。
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts']
  }
})
