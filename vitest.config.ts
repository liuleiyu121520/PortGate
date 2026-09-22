import { defineConfig } from 'vitest/config'

// 测试环境声明（方案 §3.1 / v1.2 m-02）：happy-dom 供后续 @vue/test-utils 组件测试使用
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts']
  }
})
