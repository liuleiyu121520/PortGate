<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { COPY } from '../copy'

/**
 * 统一搜索框（需求 §24 / §3；UI 重构方案 §5.6 pill 化）：
 * 高度 44px、pill 圆角、左侧搜索图标、右侧 ⌘K 键帽（5px 档）、
 * Command/Control + K 全局快捷聚焦；输入经 @search 交给 ports store（防抖接 port:list query）。
 * ⌘K 与防抖链路零改动。
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
      :placeholder="COPY.search.placeholder"
      @input="onInput"
    >
    <button
      v-if="value.length > 0"
      class="pg-search__clear"
      type="button"
      :aria-label="COPY.search.clearLabel"
      @click="clear"
    >
      ×
    </button>
    <kbd class="pg-search__kbd">
      {{ COPY.search.kbd }}
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
  border: 1px solid var(--pg-hairline);
  // §5.6 pill 化（9px 档外值废除）
  border-radius: var(--pg-radius-pill);
  background-color: var(--pg-surface);
  color: var(--pg-muted);
  transition: border-color 0.15s ease;

  // §5.6 焦点态：hairline → accent 描边 + 2px 焦点环
  &:focus-within {
    border-color: var(--pg-accent);
    outline: 2px solid var(--pg-focus);
    outline-offset: 1px;
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
    font-family: inherit;
    font-size: 14px;
    color: var(--pg-text);

    &::placeholder {
      color: var(--pg-muted);
    }
  }

  &__clear {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--pg-radius-xs);
    background-color: transparent;
    color: var(--pg-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;

    &:hover {
      color: var(--pg-text);
    }
  }

  &__kbd {
    flex: none;
    padding: 1px 6px;
    border: 1px solid var(--pg-hairline);
    border-radius: var(--pg-radius-xs);
    background-color: var(--pg-bg);
    color: var(--pg-muted);
    font-size: 12px;
    font-family: inherit;
  }
}
</style>
