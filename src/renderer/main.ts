import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import './styles/themes.less'
import './styles/base.less'
import App from './App.vue'
import { useSettingsStore } from './stores/settings'
import { usePortsStore } from './stores/ports'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())
  app.use(Antd)

  const settingsStore = useSettingsStore()
  await settingsStore.init()

  const portsStore = usePortsStore()
  await portsStore.init()

  if (import.meta.env.DEV) {
    // dev 冒烟探针挂载点：main 进程 executeJavaScript 经真实 store 切换主题（见 src/main/index.ts）
    window.__portgateDevSmoke = { settings: settingsStore }
  }

  app.mount('#app')
}

void bootstrap()
