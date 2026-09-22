<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

/**
 * 统一搜索框（需求 §24 / §3）：高度 44px、圆角 9px、左侧搜索图标、右侧 ⌘K 角标、
 * Command/Control + K 全局快捷聚焦；输入经 @search 交给 ports store（防抖接 port:list query）。
 */
const emit = defineEmits<{
  search: [query: string]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const value = ref('')

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  value.value = target.value
  emit('search', value.value)
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
}

function clear(): void {
  value.value = ''
  emit('search', '')
  inputRef.value?.focus()
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
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
      ref="inputRef"
      class="pg-search__input"
      type="text"
      :value="value"
      placeholder="搜索端口、PID、进程、应用、项目、路径、命令…"
      @input="onInput"
    >
    <button
      v-if="value.length > 0"
      class="pg-search__clear"
      type="button"
      aria-label="清空搜索"
      @click="clear"
    >
      ×
    </button>
    <kbd class="pg-search__kbd">
      ⌘K
    </kbd>
  </div>
</template>

<style lang="less" scoped>
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

  &:focus-within {
    border-color: var(--pg-accent);
  }

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

  &__clear {
    flex: none;
    border: none;
    background: transparent;
    color: var(--pg-secondary);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;

    &:hover {
      color: var(--pg-text);
    }
  }

  &__kbd {
    flex: none;
    padding: 1px 6px;
    border: 1px solid var(--pg-border);
    border-radius: 5px;
    background-color: var(--pg-background);
    color: var(--pg-secondary);
    font-size: 12px;
    font-family: inherit;
  }
}
</style>
