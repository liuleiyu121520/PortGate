/**
 * .vue 模块声明：供 tsconfig.node 工程（tests/**）下的组件测试导入 SFC 使用；
 * src/renderer 内 .vue 的真实类型由 tsconfig.web + vue-tsc 原生承担。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
