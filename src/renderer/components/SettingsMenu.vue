<script setup lang="ts">
import type { ScanInterval } from '../../shared/types'
import { COPY } from '../copy'
import { useSettingsStore } from '../stores/settings'

/**
 * 页眉设置入口（UI 重构方案 §5.1，D-UI-07/UI-AC-21 的最小实现，§11.4 范围解释登记）：
 * popover（11px 档 / elevated 面 / hairline）承载扫描周期三档分段（1 秒 / 2 秒 / 5 秒），
 * 经既有 settings:set 的 scanInterval 参数写入（1000/2000/5000 校验在 main 侧不变，
 * 无新设置项 / 无新 channel / 无存储变更）。
 */
const settingsStore = useSettingsStore()

interface IntervalOption {
  value: ScanInterval
  label: string
}

const INTERVAL_OPTIONS: readonly IntervalOption[] = [
  { value: 1000, label: COPY.settings.interval1s },
  { value: 2000, label: COPY.settings.interval2s },
  { value: 5000, label: COPY.settings.interval5s }
]

function onSelect(value: ScanInterval): void {
  void settingsStore.setScanInterval(value)
}
</script>

<template>
  <a-popover
    trigger="click"
    placement="bottomRight"
    overlay-class-name="pg-popover"
  >
    <template #content>
      <div class="pg-settings">
        <p class="pg-settings__label">
          {{ COPY.settings.scanIntervalLabel }}
        </p>
        <div class="pg-settings__options">
          <button
            v-for="option in INTERVAL_OPTIONS"
            :key="option.value"
            class="pg-settings__opt"
            :class="{ 'pg-settings__opt--active': settingsStore.scanInterval === option.value }"
            type="button"
            @click="onSelect(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="pg-settings__hint">
          {{ COPY.settings.hint }}
        </p>
      </div>
    </template>
    <button
      class="pg-icon-btn pg-press pg-settings-trigger"
      type="button"
      :aria-label="COPY.header.settingsLabel"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 4.5h5.2M11.2 4.5H14M2 11.5h1.2M7.2 11.5H14"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <circle
          cx="9.2"
          cy="4.5"
          r="1.9"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <circle
          cx="5.2"
          cy="11.5"
          r="1.9"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    </button>
  </a-popover>
</template>

<style lang="less" scoped>
.pg-settings {
  min-width: 180px;

  &__label {
    margin: 0 0 8px;
    color: var(--pg-muted);
    font-size: 12px;
    font-weight: 600;
  }

  &__options {
    display: flex;
    gap: 4px;
    padding: 2px;
    border: 1px solid var(--pg-hairline);
    border-radius: var(--pg-radius-pill);
    background-color: var(--pg-surface);
  }

  &__opt {
    flex: 1;
    min-height: 24px;
    padding: 2px 10px;
    border: none;
    border-radius: var(--pg-radius-pill);
    background-color: transparent;
    color: var(--pg-muted);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    user-select: none;

    &--active {
      background-color: var(--pg-canvas);
      color: var(--pg-accent);
      font-weight: 600;
    }
  }

  &__hint {
    margin: 8px 0 0;
    color: var(--pg-muted);
    font-size: 11px;
  }
}
</style>
