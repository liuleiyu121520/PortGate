<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { HighlightRange, PortRecord, SearchMatchInfo } from '../../shared/types'
import { COPY, DRAWER_FIELDS, DRAWER_SECTIONS, SEP, fill } from '../copy'
import HighlightText from './HighlightText.vue'
import { useTerminate } from '../composables/terminate'
import { formatClock, formatDuration } from '../utils/format'

/**
 * 端口详情 Drawer（UI 重构方案 §5.7，480px；v1.2 双语内联）：应用与项目 / 网络 / 进程 / 时间 /
 * 运行时 五区——分区标题 EN 主行 12px/600 muted + CN 辅助 11px/400 muted 同行内联
 * （首区「APPLICATION / PROJECT 应用与项目」，五区同语法无特例）；dt 双语同行内联
 * （EN 12px/400 muted 原样大小写 + CN 11px/400 muted），dt 定宽 156px（宽度推算 §5.7）。
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

// 双语定名表快捷引用（§8.2；copy-contract 六组逐对断言的消费端）
const S = DRAWER_SECTIONS
const F = DRAWER_FIELDS

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
          <span class="pg-drawer__heading-en">{{ S.appProject.en }}</span>
          <span class="pg-drawer__heading-cn">{{ S.appProject.cn }}</span>
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>
              {{ F.application.en }}<span
                v-if="F.application.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.application.cn }}</span>
            </dt>
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
            <dt>
              {{ F.project.en }}<span
                v-if="F.project.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.project.cn }}</span>
            </dt>
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
          <span class="pg-drawer__heading-en">{{ S.network.en }}</span>
          <span class="pg-drawer__heading-cn">{{ S.network.cn }}</span>
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>
              {{ F.port.en }}<span
                v-if="F.port.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.port.cn }}</span>
            </dt>
            <dd class="pg-num">
              <HighlightText
                :text="String(record.localPort)"
                :ranges="rangesFor('port')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.address.en }}<span
                v-if="F.address.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.address.cn }}</span>
            </dt>
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
            <dt>
              {{ F.protocol.en }}<span
                v-if="F.protocol.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.protocol.cn }}</span>
            </dt>
            <dd>{{ record.protocol }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.state.en }}<span
                v-if="F.state.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.state.cn }}</span>
            </dt>
            <dd>{{ record.state ?? COPY.table.emptyValue }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.exposure.en }}<span
                v-if="F.exposure.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.exposure.cn }}</span>
            </dt>
            <dd>{{ exposure }}</dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          <span class="pg-drawer__heading-en">{{ S.process.en }}</span>
          <span class="pg-drawer__heading-cn">{{ S.process.cn }}</span>
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>
              {{ F.pid.en }}<span
                v-if="F.pid.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.pid.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ record.pid }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.ppid.en }}<span
                v-if="F.ppid.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.ppid.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ record.process.ppid ?? COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.user.en }}<span
                v-if="F.user.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.user.cn }}</span>
            </dt>
            <dd>{{ record.process.user ?? COPY.table.emptyValue }}</dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.executable.en }}<span
                v-if="F.executable.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.executable.cn }}</span>
            </dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.executablePath ?? COPY.table.emptyValue"
                :ranges="rangesFor('executablePath')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.command.en }}<span
                v-if="F.command.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.command.cn }}</span>
            </dt>
            <dd class="pg-drawer__mono">
              <HighlightText
                :text="record.process.commandLine ?? COPY.table.emptyValue"
                :ranges="rangesFor('commandLine')"
              />
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.workingDir.en }}<span
                v-if="F.workingDir.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.workingDir.cn }}</span>
            </dt>
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
          <span class="pg-drawer__heading-en">{{ S.time.en }}</span>
          <span class="pg-drawer__heading-cn">{{ S.time.cn }}</span>
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>
              {{ F.processStart.en }}<span
                v-if="F.processStart.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.processStart.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ record.process.startedAt !== undefined ? formatClock(record.process.startedAt) : COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.uptime.en }}<span
                v-if="F.uptime.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.uptime.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ record.process.startedAt !== undefined ? formatDuration(now - record.process.startedAt) : COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.firstSeen.en }}<span
                v-if="F.firstSeen.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.firstSeen.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ formatClock(record.timing.firstSeen) }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.lastSeen.en }}<span
                v-if="F.lastSeen.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.lastSeen.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ formatClock(record.timing.lastSeen) }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.portDuration.en }}<span
                v-if="F.portDuration.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.portDuration.cn }}</span>
            </dt>
            <dd class="pg-num">
              {{ formatDuration(now - record.timing.firstSeen) }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="pg-drawer__section">
        <h4 class="pg-drawer__heading">
          <span class="pg-drawer__heading-en">{{ S.runtime.en }}</span>
          <span class="pg-drawer__heading-cn">{{ S.runtime.cn }}</span>
        </h4>
        <dl class="pg-drawer__rows">
          <div class="pg-drawer__row">
            <dt>{{ F.cpu.en }}</dt>
            <dd class="pg-num">
              {{ record.runtime !== undefined ? `${record.runtime.cpuPercent.toFixed(1)}%` : COPY.table.emptyValue }}
            </dd>
          </div>
          <div class="pg-drawer__row">
            <dt>
              {{ F.memory.en }}<span
                v-if="F.memory.cn !== null"
                class="pg-drawer__dt-cn"
              >{{ F.memory.cn }}</span>
            </dt>
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

  // §5.7 v1.2 分区标题双语内联：EN 主行 12px/600 muted + CN 辅助 11px/400 muted（无大写变换）
  &__heading {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin: 0 0 8px;
    color: var(--pg-muted);
  }

  &__heading-en {
    color: var(--pg-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
  }

  &__heading-cn {
    color: var(--pg-muted);
    font-size: 11px;
    font-weight: 400;
    line-height: 16px;
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

    // §5.7 v1.2：dt 定宽 156px（最长「Process Start 进程启动时间」≈151px 单行不换行），双语同行内联
    dt {
      flex: none;
      width: 156px;
      color: var(--pg-muted);
      font-size: 12px;
      line-height: 20px;
      white-space: nowrap;
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

  // CN 辅助行（§4.5 双语辅助行定档）：11px/400 muted
  &__dt-cn {
    margin-left: 4px;
    color: var(--pg-muted);
    font-size: 11px;
    font-weight: 400;
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
