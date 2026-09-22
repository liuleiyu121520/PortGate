<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { theme as antdTheme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import DetailDrawer from './components/DetailDrawer.vue'
import HighlightText from './components/HighlightText.vue'
import SearchBar from './components/SearchBar.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import { usePortsStore } from './stores/ports'
import { useSettingsStore } from './stores/settings'
import { useTerminate } from './composables/terminate'
import { THEME_PALETTES } from './theme'
import type { HighlightRange, PortRecord } from '../shared/types'
import { formatDuration } from './utils/format'

const settingsStore = useSettingsStore()
const portsStore = usePortsStore()
// 安全终止交互（确认框/PENDING_FORCE 强制二次确认/拒绝文案映射；终止后主进程触发即时重扫局部刷新）
const { confirmTerminate } = useTerminate()

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

// 统计条（全量口径，不随搜索变化；来自 port:list stats / 非搜索态本地同口径重算）
const statsItems = computed(() => [
  { label: 'Ports', value: portsStore.stats.total, exposed: false },
  { label: 'TCP', value: portsStore.stats.tcp, exposed: false },
  { label: 'UDP', value: portsStore.stats.udp, exposed: false },
  { label: 'Exposed', value: portsStore.stats.exposed, exposed: true }
])

const activeTab = ref<'current' | 'history'>('current')
const currentCount = computed(() => portsStore.records.length)

interface TableColumn {
  title: string
  key: string
  width?: number
}

// 列头按需求 §3：PORT/PROCESS/APP/PROJECT/ADDRESS/UPTIME/ACTION
const columns: TableColumn[] = [
  { title: 'PORT', key: 'port', width: 170 },
  { title: 'PROCESS', key: 'process', width: 170 },
  { title: 'APP', key: 'app', width: 110 },
  { title: 'PROJECT', key: 'project', width: 130 },
  { title: 'ADDRESS', key: 'address', width: 200 },
  { title: 'UPTIME', key: 'uptime', width: 100 },
  { title: 'ACTION', key: 'action' }
]

const drawerOpen = ref(false)
const drawerRecordId = ref<string | null>(null)
const drawerRecord = computed<PortRecord | null>(
  () => portsStore.records.find((record) => record.recordId === drawerRecordId.value) ?? null
)
const drawerMatch = computed(() =>
  drawerRecordId.value === null ? undefined : portsStore.matches[drawerRecordId.value]
)

function openDrawer(record: PortRecord): void {
  drawerRecordId.value = record.recordId
  drawerOpen.value = true
}

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

function uptimeText(record: PortRecord): string {
  return formatDuration(nowTick.value - record.timing.firstSeen)
}

function isExposed(record: PortRecord): boolean {
  return record.localAddress !== '127.0.0.1' && record.localAddress !== '::1'
}

function rangesOf(record: PortRecord, field: string): HighlightRange[] {
  return (portsStore.matches[record.recordId]?.highlights[field] ?? []) as HighlightRange[]
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

      <SearchBar @search="portsStore.setQuery" />

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
        <a-tabs
          v-model:active-key="activeTab"
          size="small"
        >
          <a-tab-pane
            key="current"
            :tab="`当前 (${currentCount})`"
          >
            <a-table
              :columns="columns"
              :data-source="portsStore.records"
              :pagination="false"
              :loading="!portsStore.ready"
              row-key="recordId"
              size="middle"
              class="pg-table"
              :custom-row="(record: PortRecord) => ({ onClick: () => openDrawer(record), class: 'pg-table__row' })"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'port'">
                  <a-tag
                    class="pg-proto-tag"
                    :class="record.protocol === 'TCP' ? 'pg-proto-tag--tcp' : 'pg-proto-tag--udp'"
                  >
                    {{ record.protocol }}
                  </a-tag>
                  <HighlightText
                    class="pg-port-number"
                    :text="String(record.localPort)"
                    :ranges="rangesOf(record, 'port')"
                  />
                  <a-tag
                    v-if="isExposed(record)"
                    class="pg-exposure-tag"
                  >
                    Exposed
                  </a-tag>
                </template>
                <template v-else-if="column.key === 'process'">
                  <HighlightText
                    :text="record.process.name"
                    :ranges="rangesOf(record, 'processName')"
                  />
                  <span class="pg-process-pid"> · {{ record.pid }}</span>
                </template>
                <template v-else-if="column.key === 'app'">
                  <HighlightText
                    v-if="record.application !== undefined"
                    :text="record.application.name"
                    :ranges="rangesOf(record, 'applicationName')"
                  />
                  <span
                    v-else
                    class="pg-cell-empty"
                  >—</span>
                </template>
                <template v-else-if="column.key === 'project'">
                  <HighlightText
                    v-if="record.project !== undefined"
                    :text="record.project.name ?? '—'"
                    :ranges="rangesOf(record, 'projectName')"
                  />
                  <span
                    v-else
                    class="pg-cell-empty"
                  >—</span>
                </template>
                <template v-else-if="column.key === 'address'">
                  <HighlightText
                    :text="record.localAddress"
                    :ranges="rangesOf(record, 'localAddress')"
                  />
                  <span>:{{ record.localPort }}</span>
                  <span
                    v-if="record.state"
                    class="pg-address-state"
                  > · {{ record.state }}</span>
                </template>
                <template v-else-if="column.key === 'uptime'">
                  <span>{{ uptimeText(record) }}</span>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-tooltip
                    v-if="record.security.level !== 'USER'"
                    :title="`System Protected（${record.security.level}）`"
                  >
                    <a-button
                      size="small"
                      disabled
                    >
                      结束
                    </a-button>
                  </a-tooltip>
                  <a-button
                    v-else
                    size="small"
                    danger
                    @click.stop="confirmTerminate(record)"
                  >
                    结束
                  </a-button>
                </template>
              </template>
            </a-table>
          </a-tab-pane>
          <a-tab-pane
            key="history"
            :tab="`历史 (0)`"
          >
            <a-empty description="暂无历史会话（阶段 5 接入）" />
          </a-tab-pane>
        </a-tabs>
      </div>

      <DetailDrawer
        :open="drawerOpen"
        :record="drawerRecord"
        :match="drawerMatch"
        @close="drawerOpen = false"
      />
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

  :deep(.pg-table__row) {
    cursor: pointer;
  }
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

.pg-cell-empty {
  color: var(--pg-muted);
}

.pg-address-state {
  color: var(--pg-muted);
  font-size: 12px;
}
</style>
