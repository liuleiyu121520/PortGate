<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { theme as antdTheme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import DetailDrawer from './components/DetailDrawer.vue'
import HighlightText from './components/HighlightText.vue'
import SearchBar from './components/SearchBar.vue'
import SettingsMenu from './components/SettingsMenu.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import { usePortsStore } from './stores/ports'
import { useSettingsStore } from './stores/settings'
import { useTerminate } from './composables/terminate'
import { COPY, SEP, STATS_LABELS, TABLE_COLUMNS, HISTORY_COLUMNS, fill } from './copy'
import { FONT_STACK, PG_RADIUS, THEME_TOKENS } from './theme'
import { TITLEBAR_MODE } from '../shared/constants'
import type { BilingualColumnDef, BilingualLabel } from './copy'
import type {
  HighlightRange,
  PortRecord,
  PortSession,
  SecurityLevel
} from '../shared/types'
import { formatClock, formatDuration } from './utils/format'

const settingsStore = useSettingsStore()
const portsStore = usePortsStore()
// 安全终止交互（确认框/PENDING_FORCE 强制二次确认/拒绝文案映射；终止后主进程触发即时重扫局部刷新）
const { confirmTerminate } = useTerminate()

// R-01 平台降级提示：非 macOS 平台显示中性 notice 横幅（§5.1，warning 琥珀废除）。
// renderer 侧禁止触碰平台标识全局变量（AC-16 红线），以 navigator.userAgent 判定（合法 Web API）。
const isNonMacPlatform = computed(
  () => !/Macintosh|Mac OS X|MacOS/i.test(navigator.userAgent)
)

// §7.3 页眉标题显隐：hiddenInset（macOS）时页眉为唯一标题层；
// TITLEBAR_MODE='system'（R-UI-2 回退开关）或非 mac 平台下去重，页眉仅状态与控件
const showHeaderTitle = TITLEBAR_MODE === 'inset' && !isNonMacPlatform.value

// antd 经 ConfigProvider 切换算法 + token（§4.8 映射表：由 theme.ts token 镜像生成）
const antdThemeConfig = computed(() => {
  const tokens = THEME_TOKENS[settingsStore.theme]
  return {
    algorithm: settingsStore.isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorBgBase: tokens.bg,
      colorBgContainer: tokens.canvas,
      colorBgElevated: tokens.elevated,
      colorTextBase: tokens.text,
      colorTextSecondary: tokens.muted,
      colorTextTertiary: tokens.muted,
      colorTextQuaternary: tokens.disabled,
      colorTextDisabled: tokens.disabled,
      colorPrimary: tokens.accentFill,
      colorLink: tokens.accent,
      colorLinkHover: tokens.accentHover,
      colorError: tokens.dangerFill,
      colorErrorText: tokens.dangerText,
      colorWarning: tokens.warning,
      colorSuccess: tokens.success,
      colorBorder: tokens.hairline,
      colorBorderSecondary: tokens.hairline,
      borderRadius: PG_RADIUS.sm,
      borderRadiusSM: PG_RADIUS.xs,
      borderRadiusLG: PG_RADIUS.lg,
      fontFamily: FONT_STACK
    }
  }
})

interface StatItem {
  label: BilingualLabel
  value: number
  exposed: boolean
}

// 统计条（§5.2 v1.2：EN 主标签 12px muted + CN 辅助 11px/400 muted；琥珀仅 Exposed>0，全量口径不随搜索变化）
const statsItems = computed<StatItem[]>(() => [
  { label: STATS_LABELS.total, value: portsStore.stats.total, exposed: false },
  { label: STATS_LABELS.tcp, value: portsStore.stats.tcp, exposed: false },
  { label: STATS_LABELS.udp, value: portsStore.stats.udp, exposed: false },
  { label: STATS_LABELS.exposed, value: portsStore.stats.exposed, exposed: true }
])

interface TabItem {
  key: 'current' | 'history'
  label: string
  count: number
}

const activeTab = ref<'current' | 'history'>('current')

// §5.3 分段控件段（计数口径不变：当前=records.length，历史=port:history 返回条数）
const tabs = computed<TabItem[]>(() => [
  { key: 'current', label: COPY.tabs.current, count: portsStore.records.length },
  { key: 'history', label: COPY.tabs.history, count: portsStore.historyCount }
])

// 历史 Tab：激活或搜索词变化时经 port:history 重拉
watch(activeTab, (tab) => {
  if (tab === 'history') {
    void portsStore.loadHistory()
  }
})

function handleSearch(query: string): void {
  portsStore.setQuery(query)
  if (activeTab.value === 'history') {
    void portsStore.loadHistory()
  }
}

function switchTab(tab: TabItem): void {
  activeTab.value = tab.key
}

interface UiColumn {
  title: string
  key: string
  width?: number
  label: BilingualLabel
}

// 列定义单一来源（§5.4/§8 v1.2：copy.ts 双语列定名表；表头经 headerCell 插槽双行堆叠渲染）
function toUiColumns(defs: readonly BilingualColumnDef[]): UiColumn[] {
  return defs.map((def) => ({ title: def.label.en, key: def.key, width: def.width, label: def.label }))
}

const currentColumns: UiColumn[] = toUiColumns(TABLE_COLUMNS)
const historyColumns: UiColumn[] = toUiColumns(HISTORY_COLUMNS)

function sessionInterval(session: PortSession): string {
  const end = session.closedAt ?? session.lastSeenAt
  return `${formatClock(session.firstSeenAt)} - ${formatClock(end)}`
}

function sessionDuration(session: PortSession): string {
  const end = session.closedAt ?? session.lastSeenAt
  return formatDuration(end - session.firstSeenAt)
}

interface EmptyState {
  title: string
  hint?: string
}

// §5.4 空态：搜索无命中 > 历史空态 / 当前空态（文案单一来源 COPY.empty）
function emptyFor(tab: 'current' | 'history'): EmptyState {
  if (portsStore.query.trim().length > 0) {
    return { title: COPY.empty.search, hint: COPY.empty.searchHint }
  }
  return tab === 'history' ? { title: COPY.empty.history } : { title: COPY.empty.current }
}

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

const hasScanError = computed(() => portsStore.scanError !== null)

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

/** 保护进程行内 tooltip（§5.5-2：行内=tooltip、抽屉=常显） */
function protectedReason(level: SecurityLevel): string {
  return fill(COPY.tooltips.protected, { level })
}

/** 地址完整值 tooltip（§5.4：remote 存在时 `local → remote`，箭头常量来自 COPY） */
function addressTooltip(record: PortRecord): string {
  const local = `${record.localAddress}:${record.localPort}`
  if (record.remoteAddress === undefined) {
    return local
  }
  const remote =
    record.remotePort !== undefined ? `${record.remoteAddress}:${record.remotePort}` : record.remoteAddress
  return `${local} ${SEP.ARROW} ${remote}`
}
</script>

<template>
  <a-config-provider
    :locale="zhCN"
    :theme="antdThemeConfig"
  >
    <div class="pg-shell">
      <header class="pg-header">
        <h1
          v-if="showHeaderTitle"
          class="pg-header__title"
        >
          {{ COPY.header.title }}
        </h1>
        <div class="pg-header__spacer" />
        <div class="pg-header__side">
          <span
            class="pg-header__status"
            :class="{ 'pg-header__status--error': hasScanError }"
          >
            <span
              class="pg-header__dot"
              :class="{ 'pg-header__dot--error': hasScanError }"
            />
            {{ hasScanError ? COPY.header.scanFailed : COPY.header.monitoring }}
          </span>
          <ThemeToggle />
          <SettingsMenu />
        </div>
      </header>

      <div
        v-if="isNonMacPlatform"
        class="pg-banner"
        role="note"
      >
        <p class="pg-banner__title">
          {{ COPY.banner.title }}
        </p>
        <p class="pg-banner__desc">
          {{ COPY.banner.description }}
        </p>
      </div>

      <div class="pg-search-row">
        <SearchBar @search="handleSearch" />
      </div>

      <div class="pg-stats">
        <template
          v-for="(stat, index) in statsItems"
          :key="stat.label.en"
        >
          <span
            v-if="index > 0"
            class="pg-stats__sep"
          >{{ SEP.DOT }}</span>
          <span
            class="pg-stats__item"
            :class="{ 'pg-stats__item--exposed': stat.exposed && portsStore.stats.exposed > 0 }"
          >
            <span class="pg-stats__label">{{ stat.label.en }}<span
              v-if="stat.label.cn !== null"
              class="pg-stats__label-cn"
            >{{ stat.label.cn }}</span></span>
            <span class="pg-stats__value pg-num">{{ stat.value }}</span>
          </span>
        </template>
      </div>

      <div class="pg-content">
        <div
          class="pg-segments"
          role="tablist"
        >
          <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            role="tab"
            class="pg-seg pg-press"
            :class="{ 'pg-seg--active': activeTab === tab.key }"
            :aria-selected="activeTab === tab.key"
            :data-tab="tab.key"
            @click="switchTab(tab)"
          >
            {{ tab.label }} {{ tab.count }}
          </button>
        </div>

        <div v-show="activeTab === 'current'">
          <a-table
            :columns="currentColumns"
            :data-source="portsStore.records"
            :pagination="false"
            :loading="!portsStore.ready"
            row-key="recordId"
            size="middle"
            table-layout="fixed"
            class="pg-table"
            :custom-row="(record: PortRecord) => ({ onClick: () => openDrawer(record), class: 'pg-table__row' })"
          >
            <template #headerCell="{ column }">
              <span class="pg-th">
                <span class="pg-th__en">{{ column.label.en }}</span>
                <span
                  v-if="column.label.cn !== null"
                  class="pg-th__cn"
                >{{ column.label.cn }}</span>
              </span>
            </template>
            <template #emptyText>
              <div class="pg-empty">
                <p class="pg-empty__title">
                  {{ emptyFor('current').title }}
                </p>
                <p
                  v-if="emptyFor('current').hint"
                  class="pg-empty__hint"
                >
                  {{ emptyFor('current').hint }}
                </p>
              </div>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'port'">
                <HighlightText
                  class="pg-port pg-num"
                  :text="String(record.localPort)"
                  :ranges="rangesOf(record, 'port')"
                />
                <span class="pg-cell-sub pg-proto">{{ record.protocol }}</span>
                <span
                  v-if="isExposed(record)"
                  class="pg-exposed-tag"
                >{{ STATS_LABELS.exposed.cn }}</span>
              </template>
              <template v-else-if="column.key === 'process'">
                <HighlightText
                  class="pg-cell-main"
                  :text="record.process.name"
                  :ranges="rangesOf(record, 'processName')"
                />
                <span class="pg-cell-sub pg-pid">
                  {{ COPY.table.pidLabel }}
                  <HighlightText
                    class="pg-num"
                    :text="String(record.pid)"
                    :ranges="rangesOf(record, 'pid')"
                  />
                  <template v-if="record.project?.name">
                    <span class="pg-pid__sep">{{ SEP.DOT }}</span>
                    <HighlightText
                      :text="record.project.name"
                      :ranges="rangesOf(record, 'projectName')"
                    />
                  </template>
                </span>
              </template>
              <template v-else-if="column.key === 'app'">
                <HighlightText
                  v-if="record.application !== undefined"
                  class="pg-cell-main"
                  :text="record.application.name"
                  :ranges="rangesOf(record, 'applicationName')"
                />
                <span
                  v-else
                  class="pg-cell-empty"
                >{{ COPY.table.emptyValue }}</span>
              </template>
              <template v-else-if="column.key === 'address'">
                <a-tooltip :title="addressTooltip(record)">
                  <span class="pg-cell-main pg-num"><HighlightText
                    :text="record.localAddress"
                    :ranges="rangesOf(record, 'localAddress')"
                  />:{{ record.localPort }}<span
                    v-if="record.state"
                    class="pg-cell-sub pg-address-state"
                  >{{ record.state }}</span></span>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'uptime'">
                <span class="pg-num">{{ uptimeText(record) }}</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-tooltip
                  v-if="record.security.level !== 'USER'"
                  :title="protectedReason(record.security.level)"
                >
                  <span class="pg-btn-mask">
                    <button
                      class="pg-btn pg-btn--terminate"
                      type="button"
                      disabled
                    >
                      {{ COPY.actions.terminate }}
                    </button>
                  </span>
                </a-tooltip>
                <button
                  v-else
                  class="pg-btn pg-btn--terminate pg-press"
                  type="button"
                  @click.stop="confirmTerminate(record)"
                >
                  {{ COPY.actions.terminate }}
                </button>
              </template>
            </template>
          </a-table>
        </div>

        <div v-show="activeTab === 'history'">
          <a-table
            :columns="historyColumns"
            :data-source="portsStore.historySessions"
            :pagination="{ pageSize: 50, hideOnSinglePage: true }"
            row-key="id"
            size="middle"
            table-layout="fixed"
            class="pg-table"
          >
            <template #headerCell="{ column }">
              <span class="pg-th">
                <span class="pg-th__en">{{ column.label.en }}</span>
                <span
                  v-if="column.label.cn !== null"
                  class="pg-th__cn"
                >{{ column.label.cn }}</span>
              </span>
            </template>
            <template #emptyText>
              <div class="pg-empty">
                <p class="pg-empty__title">
                  {{ emptyFor('history').title }}
                </p>
                <p
                  v-if="emptyFor('history').hint"
                  class="pg-empty__hint"
                >
                  {{ emptyFor('history').hint }}
                </p>
              </div>
            </template>
            <template #bodyCell="{ column, record: session }">
              <template v-if="column.key === 'port'">
                <span class="pg-port pg-num">{{ session.localPort }}</span>
                <span class="pg-cell-sub pg-proto">{{ session.protocol }}</span>
              </template>
              <template v-else-if="column.key === 'process'">
                <span class="pg-cell-main">{{ session.processName }}</span>
                <span class="pg-cell-sub pg-pid">
                  {{ COPY.table.pidLabel }} {{ session.pid }}<template v-if="session.projectName">
                    {{ SEP.DOT }} {{ session.projectName }}</template>
                </span>
              </template>
              <template v-else-if="column.key === 'interval'">
                <span class="pg-num">{{ sessionInterval(session) }}</span>
              </template>
              <template v-else-if="column.key === 'duration'">
                <span class="pg-num">{{ sessionDuration(session) }}</span>
              </template>
            </template>
          </a-table>
        </div>
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
  background-color: var(--pg-bg);
  transition: background-color 0.2s ease;
}

/* ---------- §5.1 页眉（52px 全幅条带、拖拽区、交通灯避让） ---------- */
.pg-header {
  display: flex;
  flex: none;
  align-items: center;
  height: 52px;
  // hiddenInset 交通灯避让：x=16 + 灯组 ~52px → 内容自 80px 起（§7.1/§7.2）
  padding: 0 16px 0 80px;
  background-color: var(--pg-bg);
  -webkit-app-region: drag;
  user-select: none;

  &__title {
    margin: 0;
    // §4.5 页面标题：17px/600/字距 -0.2px/行高 22px
    color: var(--pg-text);
    font-size: 17px;
    font-weight: 600;
    line-height: 22px;
    letter-spacing: -0.2px;
    white-space: nowrap;
  }

  &__spacer {
    flex: 1;
    min-width: 0;
  }

  &__side {
    display: flex;
    flex: none;
    gap: var(--pg-space-3);
    align-items: center;
  }

  &__status {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--pg-muted);
    font-size: 12px;
    white-space: nowrap;

    &--error {
      color: var(--pg-danger-text);
    }
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: var(--pg-radius-pill);
    background-color: var(--pg-success);

    &--error {
      background-color: var(--pg-danger-text);
    }
  }
}

/* ---------- R-01 平台横幅（中性 notice） ---------- */
.pg-banner {
  flex: none;
  margin: 0 20px;
  padding: 10px 14px;
  border: 1px solid var(--pg-hairline);
  border-radius: var(--pg-radius-sm);
  background-color: var(--pg-surface);

  &__title {
    margin: 0;
    color: var(--pg-text);
    font-size: 13px;
    font-weight: 600;
  }

  &__desc {
    margin: 4px 0 0;
    color: var(--pg-muted);
    font-size: 12px;
  }
}

.pg-search-row {
  flex: none;
  padding: 12px 20px 0;
}

/* ---------- §5.2 统计条（40px 全幅条带，surface 面） ---------- */
.pg-stats {
  display: flex;
  flex: none;
  gap: 10px;
  align-items: center;
  height: 40px;
  margin-top: var(--pg-space-3);
  padding: 0 20px;
  background-color: var(--pg-surface);
  user-select: none;

  &__label {
    color: var(--pg-muted);
    font-size: 12px;
  }

  // §5.2 v1.2 双语辅助：CN 11px/400 muted
  &__label-cn {
    margin-left: 4px;
    color: var(--pg-muted);
    font-size: 11px;
    font-weight: 400;
  }

  &__value {
    margin-left: 4px;
    color: var(--pg-text);
    font-size: 13px;
    font-weight: 600;
  }

  &__sep {
    color: var(--pg-muted);
    font-size: 12px;
  }

  // 琥珀唯一条件：仅 Exposed>0 时「对外」数字用 --pg-warning（§5.2）
  &__item--exposed .pg-stats__value {
    color: var(--pg-warning);
  }
}

.pg-content {
  flex: 1;
  min-height: 0;
  padding: 12px 20px 16px;
  overflow: auto;
}

/* ---------- §5.3 分段控件（pill 容器 + elevated 系选中 chip，替换 a-tabs） ---------- */
.pg-segments {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  margin-bottom: var(--pg-space-3);
  padding: 2px;
  border: 1px solid var(--pg-hairline);
  border-radius: var(--pg-radius-pill);
  background-color: var(--pg-surface);
  user-select: none;
}

.pg-seg {
  min-width: 64px;
  min-height: 26px;
  padding: 3px 14px;
  border: none;
  border-radius: var(--pg-radius-pill);
  background-color: transparent;
  color: var(--pg-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  cursor: pointer;
  user-select: none;

  // 选中段：chip（canvas 面，暗色下与 surface 容器可辨）+ 交互蓝文字档 600（UI-AC-19）
  &--active {
    background-color: var(--pg-canvas);
    color: var(--pg-accent);
    font-weight: 600;
  }
}

/* ---------- §5.4 表格密度与单行化（antd Table 保留，token + 定向覆盖） ---------- */
.pg-table {
  :deep(.ant-table) {
    background-color: transparent;
  }

  // 表头容器：双语双行堆叠由 .pg-th 承载；底 hairline（UI-AC-14）；带高 8+16+2+14+8 = 48px（§5.4 v1.2 核定）
  :deep(.ant-table-thead > tr > th) {
    padding: 8px 12px;
    background-color: transparent;
    border-bottom: 1px solid var(--pg-hairline);
    color: var(--pg-muted);
    user-select: none;
  }

  // 单元格：padding 与 copy.ts TABLE_DENSITY 恒等（13px 12px）→ 行高 13*2+20+1 = 47px ∈ 44–60；
  // 单行化 + hairline 行分隔 + 斑马纹/外框废除
  :deep(.ant-table-tbody > tr > td) {
    padding: 13px 12px;
    background-color: transparent;
    border-bottom: 1px solid var(--pg-hairline);
    color: var(--pg-text);
    font-size: 13px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 0.15s ease;
  }

  // 行 hover：tile 微阶语法（--pg-surface），行点击开抽屉行为不变
  :deep(.ant-table-tbody > tr.ant-table-row:hover > td) {
    background-color: var(--pg-surface);
  }

  :deep(.pg-table__row) {
    cursor: pointer;
  }
}

/* ---------- §5.4 v1.2 双语表头（两行堆叠：EN 主行 12px/600 muted + CN 辅助行 11px/400 muted；带高 8+16+2+14+8 = 48px） ---------- */
.pg-th {
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;

  &__en {
    color: var(--pg-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
  }

  &__cn {
    color: var(--pg-muted);
    font-size: 11px;
    font-weight: 400;
    line-height: 14px;
  }
}

/* ---------- 单元格语义（无状态色徽标：TCP/UDP 纯文本，UI-AC-03/11） ---------- */
.pg-port {
  color: var(--pg-text);
  font-weight: 600;
}

.pg-cell-main {
  color: var(--pg-text);
}

.pg-cell-sub {
  color: var(--pg-muted);
  font-size: 12px;
}

.pg-cell-empty {
  color: var(--pg-muted);
}

.pg-proto {
  margin-left: 8px;
}

// 琥珀唯一语义色（§4.2）：Exposed 短标签 11px，仅出现在 PORT 列 Exposed 行
.pg-exposed-tag {
  margin-left: 8px;
  color: var(--pg-warning);
  font-size: 11px;
}

.pg-pid {
  margin-left: 8px;

  &__sep {
    margin: 0 4px;
  }
}

.pg-address-state {
  margin-left: 8px;
}

/* ---------- §5.4 空态 ---------- */
.pg-empty {
  padding: 32px 0;

  &__title {
    margin: 0;
    color: var(--pg-text);
    font-size: 13px;
    text-align: center;
  }

  &__hint {
    margin: 6px 0 0;
    color: var(--pg-muted);
    font-size: 12px;
    text-align: center;
  }
}
</style>
