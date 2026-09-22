<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { HighlightRange, PortRecord, SearchMatchInfo } from '../../shared/types'
import HighlightText from './HighlightText.vue'
import { useTerminate } from '../composables/terminate'
import { formatClock, formatDuration } from '../utils/format'

/**
 * 端口详情 Drawer（需求 §5 布局，480px）：Network / Process / Time / Runtime 分区；
 * 阶段 4 接通操作按钮：结束进程（USER 级；确认框 → SIGTERM → PENDING_FORCE 二次强制确认，
 * 非 USER 显示 System Protected 禁止态）、打开项目目录（record:reveal，main 校验路径归属）、
 * 复制命令（renderer navigator.clipboard，无 IPC）。命中高亮沿用 HighlightText 唯一实现。
 */
const props = defineProps<{
  open: boolean
  record: PortRecord | null
  match: SearchMatchInfo | undefined
}>()

const emit = defineEmits<{
  close: []
}>()

const { confirmTerminate } = useTerminate(() => {
  // 终止成功后主进程触发即时重扫，DIFF 局部刷新列表；关闭 Drawer 避免展示已消失记录
  emit('close')
})

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

watch(
  () => props.open,
  (open) => {
    if (open) {
      now.value = Date.now()
      if (ticker === null) {
        ticker = setInterval(() => {
          now.value = Date.now()
        }, 30000)
      }
    } else if (ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }
)

onUnmounted(() => {
  if (ticker !== null) {
    clearInterval(ticker)
  }
})

const rangesFor = (field: string): HighlightRange[] =>
  (props.match?.highlights[field] ?? []) as HighlightRange[]

const exposure = computed(() => {
  const record = props.record
  if (record === null) {
    return ''
  }
  return record.localAddress === '127.0.0.1' || record.localAddress === '::1'
    ? 'Local · 仅本机'
    : 'Exposed · 对外监听'
})

const isProtected = computed(
  () => props.record !== null && props.record.security.level !== 'USER'
)

function onReveal(): void {
  const record = props.record
  if (record === null || record.project?.path === undefined) {
    return
  }
  void window.portgate
    .revealRecord(record.recordId, 'project')
    .then((result: { ok: boolean }) => {
      if (!result.ok) {
        message.error('打开目录失败（路径不存在或已失效）')
      }
    })
}

async function onCopyCommand(): Promise<void> {
  const commandLine = props.record?.process.commandLine
  if (commandLine === undefined) {
    return
  }
  try {
    await navigator.clipboard.writeText(commandLine)
    message.success('命令已复制')
  } catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <a-drawer
    :open="open"
    width="480"
    :title="record !== null ? `${record.localPort} · ${record.protocol}` : '端口详情'"
    @close="emit('close')"
  >
    <div
      v-if="record !== null"
      class="pg-drawer"
    >
      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          Application / Project
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>Application</dt>
            <dd>
              <HighlightText
                v-if="record.application !== undefined"
                :text="record.application.name"
                :ranges="rangesFor('applicationName')"
              />
              <span v-else>—</span>
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Project</dt>
            <dd>
              <HighlightText
                v-if="record.project !== undefined"
                :text="record.project.name ?? '—'"
                :ranges="rangesFor('projectName')"
              />
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          Network
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>Port</dt>
            <dd>
              <HighlightText
                :text="String(record.localPort)"
                :ranges="rangesFor('port')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Address</dt>
            <dd>
              <HighlightText
                :text="record.localAddress"
                :ranges="rangesFor('localAddress')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Protocol</dt>
            <dd>{{ record.protocol }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>State</dt>
            <dd>{{ record.state ?? '—' }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Exposure</dt>
            <dd>{{ exposure }}</dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          Process
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>PID</dt>
            <dd>{{ record.pid }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>PPID</dt>
            <dd>{{ record.process.ppid ?? '—' }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>User</dt>
            <dd>{{ record.process.user ?? '—' }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Executable</dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.executablePath ?? '—'"
                :ranges="rangesFor('executablePath')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Command</dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.commandLine ?? '—'"
                :ranges="rangesFor('commandLine')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Working Dir</dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.workingDirectory ?? '—'"
                :ranges="rangesFor('workingDirectory')"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          Time
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>Process Start</dt>
            <dd>{{ record.process.startedAt !== undefined ? formatClock(record.process.startedAt) : '—' }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Uptime</dt>
            <dd>{{ record.process.startedAt !== undefined ? formatDuration(now - record.process.startedAt) : '—' }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>First Seen</dt>
            <dd>{{ formatClock(record.timing.firstSeen) }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Last Seen</dt>
            <dd>{{ formatClock(record.timing.lastSeen) }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Port Duration</dt>
            <dd>{{ formatDuration(now - record.timing.firstSeen) }}</dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          Runtime
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>CPU</dt>
            <dd>{{ record.runtime !== undefined ? `${record.runtime.cpuPercent.toFixed(1)}%` : '—' }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>Memory</dt>
            <dd>{{ record.runtime !== undefined ? `${record.runtime.memPercent.toFixed(1)}%` : '—' }}</dd>
          </div>
        </dl>
      </section>

      <footer class="pg-drawer__actions">
        <a-button
          size="small"
          :disabled="record.project?.path === undefined"
          @click="onReveal"
        >
          打开项目目录
        </a-button>
        <a-button
          size="small"
          :disabled="record.process.commandLine === undefined"
          @click="onCopyCommand"
        >
          复制命令
        </a-button>
        <a-tooltip v-if="isProtected">
          <template #title>
            System Protected（{{ record.security.level }}），禁止结束
          </template>
          <a-button
            size="small"
            danger
            disabled
          >
            结束进程
          </a-button>
        </a-tooltip>
        <a-button
          v-else
          size="small"
          danger
          @click="confirmTerminate(record)"
        >
          结束进程
        </a-button>
      </footer>
      <p class="pg-drawer__hint">
        对外监听 ≠ 公网可达；终止仅对 USER 级进程放行，主进程全量校验防 PID 复用。
      </p>
    </div>
  </a-drawer>
</template>

<style lang="less" scoped>
.pg-drawer {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__section {
    border: 1px solid var(--pg-border);
    border-radius: 8px;
    padding: 10px 12px;
    background-color: var(--pg-surface);
  }

  &__heading {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--pg-secondary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }

  &__row {
    display: flex;
    gap: 12px;

    dt {
      flex: none;
      width: 104px;
      color: var(--pg-secondary);
      font-size: 12px;
      line-height: 20px;
    }

    dd {
      flex: 1;
      margin: 0;
      color: var(--pg-text);
      font-size: 12px;
      line-height: 20px;
      word-break: break-all;
    }
  }

  &__mono {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }

  &__actions {
    display: flex;
    gap: 8px;
  }

  &__hint {
    margin: 0;
    font-size: 11px;
    color: var(--pg-muted);
  }
}
</style>
