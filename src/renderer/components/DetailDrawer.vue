<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { HighlightRange, PortRecord, SearchMatchInfo } from '../../shared/types'
import { COPY, SEP, fill } from '../copy'
import HighlightText from './HighlightText.vue'
import { useTerminate } from '../composables/terminate'
import { formatClock, formatDuration } from '../utils/format'

/**
 * 端口详情 Drawer（UI 重构方案 §5.7，480px）：应用与项目 / 网络 / 进程 / 时间 / 运行时 五区，
 * 中文分区标题（废除大写英文）、11px 内嵌块、左缘 18px 面板（base.less .pg-drawer 承载）。
 * 操作按钮三级语法：打开项目目录 / 复制命令（中性次级）+ 结束进程（中性 ghost、hover 红升格；
 * 保护进程禁用 + 行内常显原因）。record:reveal / clipboard 逻辑零改动；命中高亮沿用
 * HighlightText 唯一实现；remote 存在时地址以 → 连接（SEP.ARROW）。
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
    ? COPY.drawer.exposureLocal
    : COPY.drawer.exposureExposed
})

const isProtected = computed(
  () => props.record !== null && props.record.security.level !== 'USER'
)

/** 抽屉行内常显保护原因（§5.5-2：行内=tooltip、抽屉=常显，两选一全覆盖） */
const protectReason = computed(() =>
  props.record === null
    ? ''
    : fill(COPY.tooltips.protected, { level: props.record.security.level })
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
        message.error(COPY.messages.revealFailed)
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
    message.success(COPY.messages.copied)
  } catch {
    message.error(COPY.messages.copyFailed)
  }
}
</script>

<template>
  <a-drawer
    :open="open"
    width="480"
    :title="COPY.drawer.title"
    root-class-name="pg-drawer"
    @close="emit('close')"
  >
    <div
      v-if="record !== null"
      class="pg-drawer"
    >
      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          {{ COPY.drawer.sections.appProject }}
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.application }}</dt>
            <dd>
              <HighlightText
                v-if="record.application !== undefined"
                :text="record.application.name"
                :ranges="rangesFor('applicationName')"
              />
              <span v-else>{{ COPY.table.emptyValue }}</span>
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.project }}</dt>
            <dd>
              <HighlightText
                v-if="record.project !== undefined"
                :text="record.project.name ?? COPY.table.emptyValue"
                :ranges="rangesFor('projectName')"
              />
              <span v-else>{{ COPY.table.emptyValue }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          {{ COPY.drawer.sections.network }}
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.port }}</dt>
            <dd class="pg-num">
              <HighlightText
                :text="String(record.localPort)"
                :ranges="rangesFor('port')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.address }}</dt>
            <dd class="pg-num">
              <HighlightText
                :text="record.localAddress"
                :ranges="rangesFor('localAddress')"
              />:{{ record.localPort }}<template v-if="record.remoteAddress !== undefined">
                <span class="pg-drawer__arrow">{{ SEP.ARROW }}</span>{{ record.remoteAddress }}:{{ record.remotePort ?? '' }}
              </template>
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.protocol }}</dt>
            <dd>{{ record.protocol }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.state }}</dt>
            <dd>{{ record.state ?? COPY.table.emptyValue }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.exposure }}</dt>
            <dd>{{ exposure }}</dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          {{ COPY.drawer.sections.process }}
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.pid }}</dt>
            <dd class="pg-num">
              {{ record.pid }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.ppid }}</dt>
            <dd class="pg-num">
              {{ record.process.ppid ?? COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.user }}</dt>
            <dd>{{ record.process.user ?? COPY.table.emptyValue }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.executable }}</dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.executablePath ?? COPY.table.emptyValue"
                :ranges="rangesFor('executablePath')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.command }}</dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.commandLine ?? COPY.table.emptyValue"
                :ranges="rangesFor('commandLine')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.workingDir }}</dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.workingDirectory ?? COPY.table.emptyValue"
                :ranges="rangesFor('workingDirectory')"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          {{ COPY.drawer.sections.time }}
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.processStart }}</dt>
            <dd class="pg-num">
              {{ record.process.startedAt !== undefined ? formatClock(record.process.startedAt) : COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.uptime }}</dt>
            <dd class="pg-num">
              {{ record.process.startedAt !== undefined ? formatDuration(now - record.process.startedAt) : COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.firstSeen }}</dt>
            <dd class="pg-num">
              {{ formatClock(record.timing.firstSeen) }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.lastSeen }}</dt>
            <dd class="pg-num">
              {{ formatClock(record.timing.lastSeen) }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.portDuration }}</dt>
            <dd class="pg-num">
              {{ formatDuration(now - record.timing.firstSeen) }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          {{ COPY.drawer.sections.runtime }}
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.cpu }}</dt>
            <dd class="pg-num">
              {{ record.runtime !== undefined ? `${record.runtime.cpuPercent.toFixed(1)}%` : COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>{{ COPY.drawer.fields.memory }}</dt>
            <dd class="pg-num">
              {{ record.runtime !== undefined ? `${record.runtime.memPercent.toFixed(1)}%` : COPY.table.emptyValue }}
            </dd>
          </div>
        </dl>
      </section>

      <footer class="pg-drawer__actions">
        <button
          class="pg-btn pg-press"
          type="button"
          :disabled="record.project?.path === undefined"
          @click="onReveal"
        >
          {{ COPY.actions.openProjectDir }}
        </button>
        <button
          class="pg-btn pg-press"
          type="button"
          :disabled="record.process.commandLine === undefined"
          @click="onCopyCommand"
        >
          {{ COPY.actions.copyCommand }}
        </button>
        <button
          v-if="isProtected"
          class="pg-btn pg-btn--terminate"
          type="button"
          disabled
        >
          {{ COPY.actions.terminateProcess }}
        </button>
        <button
          v-else
          class="pg-btn pg-btn--terminate pg-press"
          type="button"
          @click="confirmTerminate(record)"
        >
          {{ COPY.actions.terminateProcess }}
        </button>
      </footer>
      <p
        v-if="isProtected"
        class="pg-drawer__protect-reason"
      >
        {{ protectReason }}
      </p>
      <p class="pg-drawer__hint">
        {{ COPY.drawer.hint }}
      </p>
    </div>
  </a-drawer>
</template>

<style lang="less" scoped>
.pg-drawer {
  display: flex;
  flex-direction: column;
  gap: var(--pg-space-4);

  &__section {
    // §5.7 内嵌块：11px 档 + hairline + surface 底
    border: 1px solid var(--pg-hairline);
    border-radius: var(--pg-radius-md);
    padding: 10px 12px;
    background-color: var(--pg-surface);
  }

  &__heading {
    margin: 0 0 8px;
    // §5.7 中文分区标题 12px/600 muted（大写英文与正字距废除）
    color: var(--pg-muted);
    font-size: 12px;
    font-weight: 600;
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }

  &__row {
    display: flex;
    gap: var(--pg-space-3);

    dt {
      flex: none;
      width: 104px;
      color: var(--pg-muted);
      font-size: 12px;
      line-height: 20px;
    }

    dd {
      flex: 1;
      margin: 0;
      color: var(--pg-text);
      font-size: 13px;
      line-height: 20px;
      // §5.7 break-all 废除（UI-AC-12 不断词）；仅超长无空格串按行宽断行防溢出
      word-break: normal;
      overflow-wrap: anywhere;
    }
  }

  &__mono {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }

  &__arrow {
    margin: 0 4px;
    color: var(--pg-muted);
  }

  &__actions {
    display: flex;
    gap: var(--pg-space-2);
  }

  &__protect-reason {
    margin: calc(-1 * var(--pg-space-3)) 0 0;
    color: var(--pg-muted);
    font-size: 12px;
  }

  &__hint {
    margin: 0;
    color: var(--pg-muted);
    font-size: 11px;
  }
}
</style>
