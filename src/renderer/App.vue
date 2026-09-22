<script setup lang="ts">
import { computed } from 'vue'
import { theme as antdTheme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import ThemeToggle from './components/ThemeToggle.vue'
import { useSettingsStore } from './stores/settings'
import { THEME_PALETTES } from './theme'

const settingsStore = useSettingsStore()

const palette = computed(() => THEME_PALETTES[settingsStore.theme])

// antd 经 ConfigProvider 切换算法 + token（映射同一色板源，方案 §6）
const antdThemeConfig = computed(() => ({
  algorithm: settingsStore.isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorBgBase: palette.value.background,
    colorTextBase: palette.value.text,
    colorPrimary: palette.value.accent,
    colorBorder: palette.value.border,
    colorBorderSecondary: palette.value.border,
    colorSuccess: palette.value.success,
    colorWarning: palette.value.warning,
    colorError: palette.value.danger
  }
}))

interface StatItem {
  label: string
  value: number
  exposed?: boolean
}

// 阶段 1 静态占位：统计条数值随阶段 2 port:list 接入后由 stores/ports 驱动
const stats: StatItem[] = [
  { label: 'Ports', value: 0 },
  { label: 'TCP', value: 0 },
  { label: 'UDP', value: 0 },
  { label: 'Exposed', value: 0, exposed: true }
]

interface TableColumn {
  title: string
  dataIndex: string
  key: string
  width?: number
}

// 阶段 1 静态骨架：列表列头按需求 §3，数据随阶段 2/3 接入
const columns: TableColumn[] = [
  { title: 'PORT', dataIndex: 'port', key: 'port', width: 96 },
  { title: 'PROCESS', dataIndex: 'process', key: 'process' },
  { title: 'APP', dataIndex: 'app', key: 'app' },
  { title: 'PROJECT', dataIndex: 'project', key: 'project' },
  { title: 'ADDRESS', dataIndex: 'address', key: 'address' },
  { title: 'UPTIME', dataIndex: 'uptime', key: 'uptime' },
  { title: 'ACTION', dataIndex: 'action', key: 'action', width: 110 }
]
</script>

<template>
  <a-config-provider
    :locale="zhCN"
    :theme="antdThemeConfig"
  >
    <div class="pg-shell">
      <header class="pg-header">
        <div class="pg-brand">
          <h1 class="pg-brand__title">
            PortGate · 端口门禁
          </h1>
          <span class="pg-brand__status">
            <span class="pg-brand__dot" />
            Monitoring
          </span>
        </div>
        <ThemeToggle />
      </header>

      <div class="pg-search">
        <svg
          class="pg-search__icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="7"
            cy="7"
            r="4.5"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            d="M10.6 10.6 14 14"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
        <input
          class="pg-search__input"
          type="text"
          placeholder="搜索端口、PID、进程、应用、项目、路径、命令…"
        >
        <kbd class="pg-search__kbd">
          ⌘K
        </kbd>
      </div>

      <div class="pg-stats">
        <span
          v-for="stat in stats"
          :key="stat.label"
          class="pg-stats__item"
          :class="{ 'pg-stats__item--exposed': stat.exposed }"
        >
          <strong>{{ stat.value }}</strong> {{ stat.label }}
        </span>
      </div>

      <div class="pg-content">
        <a-tabs default-active-key="current">
          <a-tab-pane
            key="current"
            tab="当前 (0)"
          >
            <a-table
              :columns="columns"
              :data-source="[]"
              :pagination="false"
              size="middle"
              class="pg-table"
            />
          </a-tab-pane>
          <a-tab-pane
            key="history"
            tab="历史 (0)"
          >
            <a-empty description="暂无历史会话（阶段 5 接入）" />
          </a-tab-pane>
        </a-tabs>
      </div>
    </div>
  </a-config-provider>
</template>

<style lang="less" scoped>
.pg-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 0 20px 16px;
  background-color: var(--pg-background);
  transition: background-color 0.2s ease;
}

.pg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 2px 10px;
}

.pg-brand {
  display: flex;
  align-items: baseline;

  &__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--pg-text);
  }

  &__status {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: 12px;
    font-size: 12px;
    color: var(--pg-secondary);
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--pg-success);
  }
}

.pg-search {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--pg-border);
  border-radius: 9px;
  background-color: var(--pg-surface);
  color: var(--pg-muted);

  &__icon {
    flex: none;
    color: var(--pg-muted);
  }

  &__input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--pg-text);

    &::placeholder {
      color: var(--pg-muted);
    }
  }

  &__kbd {
    padding: 1px 6px;
    border: 1px solid var(--pg-border);
    border-radius: 5px;
    background-color: var(--pg-background);
    color: var(--pg-secondary);
    font-size: 12px;
    font-family: inherit;
  }
}

.pg-stats {
  display: flex;
  gap: 18px;
  padding: 12px 2px;
  font-size: 13px;
  color: var(--pg-secondary);

  &__item strong {
    font-weight: 600;
    color: var(--pg-text);
  }

  &__item--exposed strong {
    color: var(--pg-warning);
  }
}

.pg-content {
  flex: 1;
  min-height: 0;
}
</style>
