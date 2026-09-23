<script setup lang="ts">
import { computed } from 'vue'
import type { ThemeName } from '../../shared/types'
import { COPY } from '../copy'
import { useSettingsStore } from '../stores/settings'

/**
 * 主题图标钮（UI 重构方案 §5.1，D-UI-07）：
 * 28×28 pill 圆图标钮（sun/moon 自绘 SVG），tooltip 显示当前主题名「浅色/深色」；
 * 原 a-switch + 英文主题名常驻废除。store 调用（setTheme）与持久化键值零变更。
 */
const settingsStore = useSettingsStore()

const isDark = computed(() => settingsStore.isDark)

// tooltip 显示当前主题（非目标主题）：与「主题名不常驻」口径一致
const themeLabel = computed(() => (isDark.value ? COPY.header.themeDark : COPY.header.themeLight))

function onToggle(): void {
  const next: ThemeName = isDark.value ? 'light' : 'dark'
  void settingsStore.setTheme(next)
}
</script>

<template>
  <a-tooltip :title="themeLabel">
    <button
      class="pg-icon-btn pg-press"
      type="button"
      :aria-label="themeLabel"
      :disabled="!settingsStore.initialized"
      @click="onToggle"
    >
      <svg
        v-if="isDark"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="8"
          cy="8"
          r="3.2"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <path
          d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
      <svg
        v-else
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M13.6 9.7A6 6 0 0 1 6.3 2.4a6 6 0 1 0 7.3 7.3Z"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </a-tooltip>
</template>
