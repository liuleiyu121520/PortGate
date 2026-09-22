<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { theme as antdTheme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import ThemeToggle from './components/ThemeToggle.vue'
import { usePortsStore } from './stores/ports'
import { useSettingsStore } from './stores/settings'
import { THEME_PALETTES } from './theme'
import type { PortRecord } from '../shared/types'

const settingsStore = useSettingsStore()
const portsStore = usePortsStore()

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

// 统计条（阶段 2 实时：来自 port:list 快照 + port:events 局部更新）
const statsItems = computed(() => [
  { label: 'Ports', value: portsStore.stats.total, exposed: false },
  { label: 'TCP', value: portsStore.stats.tcp, exposed: false },
  { label: 'UDP', value: portsStore.stats.udp, exposed: false },
  { label: 'Exposed', value: portsStore.stats.exposed, exposed: true }
])

interface TableColumn {
  title: string
  key: string
  width?: number
}

// 阶段 2 极简列表（方案 §7：此时可用极简列表验证）；完整列与详情 Drawer 属阶段 3
const columns: TableColumn[] = [
  { title: 'PORT', key: 'port', width: 170 },
  { title: 'PROCESS', key: 'process', width: 200 },
  { title: 'ADDRESS', key: 'address', width: 230 },
  { title: 'UPTIME', key: 'uptime' }
]

const nowTick = ref(Date.now())
let uptimeTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Uptime 每分钟重算展示（方案 §6）
  uptimeTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 60000)
})

onUnmounted(() => {
  if (uptimeTimer !== null) {
    clearInterval(uptimeTimer)
  }
})

function formatUptime(ms: number): string {
  const safe = Math.max(ms, 0)
  const totalSeconds = Math.floor(safe / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}h${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`
  }
  return `${seconds}s`
}

function uptimeText(record: PortRecord): string {
  return formatUptime(nowTick.value - record.timing.firstSeen)
}

function isExposed(record: PortRecord): boolean {
  return record.localAddress !== '127.0.0.1' && record.localAddress !== '::1'
}
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
          <span
            class="pg-brand__status"
            :class="{ 'pg-brand__status--error': portsStore.scanError !== null }"
          >
            <span
              class="pg-brand__dot"
              :class="{ 'pg-brand__dot--error': portsStore.scanError !== null }"
            />
            {{ portsStore.scanError !== null ? 'Scan Error' : 'Monitoring' }}
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
          v-for="stat in statsItems"
          :key="stat.label"
          class="pg-stats__item"
          :class="{ 'pg-stats__item--exposed': stat.exposed }"
        >
          <strong>{{ stat.value }}</strong> {{ stat.label }}
        </span>
      </div>

      <div class="pg-content">
        <a-table
          :columns="columns"
          :data-source="portsStore.records"
          :pagination="false"
          :loading="!portsStore.ready"
          row-key="recordId"
          size="middle"
          class="pg-table"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'port'">
              <a-tag
                class="pg-proto-tag"
                :class="record.protocol === 'TCP' ? 'pg-proto-tag--tcp' : 'pg-proto-tag--udp'"
              >
                {{ record.protocol }}
              </a-tag>
              <span class="pg-port-number">{{ record.localPort }}</span>
              <a-tag
                v-if="isExposed(record)"
                class="pg-exposure-tag"
              >
                Exposed
              </a-tag>
            </template>
            <template v-else-if="column.key === 'process'">
              <span class="pg-process-name">{{ record.process.name }}</span>
              <span class="pg-process-pid"> · {{ record.pid }}</span>
            </template>
            <template v-else-if="column.key === 'address'">
              <span>{{ record.localAddress }}:{{ record.localPort }}</span>
              <span
                v-if="record.state"
                class="pg-address-state"
              > · {{ record.state }}</span>
            </template>
            <template v-else-if="column.key === 'uptime'">
              <span>{{ uptimeText(record) }}</span>
            </template>
          </template>
        </a-table>
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

  &__dot--error {
    background-color: var(--pg-danger);
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

.pg-proto-tag--tcp {
  color: var(--pg-accent);
  border-color: var(--pg-accent);
}

.pg-proto-tag--udp {
  color: var(--pg-success);
  border-color: var(--pg-success);
}

.pg-port-number {
  margin: 0 4px;
  font-weight: 600;
}

.pg-exposure-tag {
  color: var(--pg-warning);
  border-color: var(--pg-warning);
}

.pg-process-pid {
  color: var(--pg-muted);
}

.pg-address-state {
  color: var(--pg-muted);
  font-size: 12px;
}
</style>
