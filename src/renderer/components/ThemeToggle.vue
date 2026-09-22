<script setup lang="ts">
import { computed } from 'vue'
import type { ThemeName } from '../../shared/types'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()

const isDark = computed(() => settingsStore.isDark)

const themeLabel = computed(() => (isDark.value ? 'Midnight Slate' : 'Cloud Slate'))

function onSwitchChange(value: boolean | string | number): void {
  const next: ThemeName = value === true ? 'dark' : 'light'
  void settingsStore.setTheme(next)
}
</script>

<template>
  <div class="pg-theme-toggle">
    <span class="pg-theme-toggle__name">
      {{ themeLabel }}
    </span>
    <a-switch
      :checked="isDark"
      size="small"
      :disabled="!settingsStore.initialized"
      @change="onSwitchChange"
    />
  </div>
</template>

<style lang="less" scoped>
.pg-theme-toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;

  &__name {
    font-size: 12px;
    color: var(--pg-secondary);
  }
}
</style>
