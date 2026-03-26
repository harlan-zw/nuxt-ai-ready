<script lang="ts" setup>
import { computed, inject } from 'vue'
import { GlobalDataKey } from '../composables/types'

const globalData = inject(GlobalDataKey)
const config = computed(() => globalData?.value?.config)
const llmsTxt = computed(() => globalData?.value?.llmsTxt)

const configJson = computed(() => {
  if (!config.value)
    return ''
  return JSON.stringify(config.value, null, 2)
})

const llmsTxtJson = computed(() => {
  if (!llmsTxt.value)
    return ''
  return JSON.stringify(llmsTxt.value, null, 2)
})

const fullJson = computed(() => {
  if (!globalData?.value)
    return ''
  return JSON.stringify(globalData.value, null, 2)
})
</script>

<template>
  <div class="space-y-4">
    <DevtoolsSection text="Module Config" icon="carbon:settings" :open="true">
      <div v-if="configJson" class="relative">
        <DevtoolsCopyButton :text="configJson" class="absolute top-2 right-2 z-10" />
        <pre class="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text)] overflow-auto max-h-[400px]">{{ configJson }}</pre>
      </div>
    </DevtoolsSection>

    <DevtoolsSection text="llms.txt Config" icon="carbon:document" :open="true">
      <div v-if="llmsTxtJson" class="relative">
        <DevtoolsCopyButton :text="llmsTxtJson" class="absolute top-2 right-2 z-10" />
        <pre class="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text)] overflow-auto max-h-[400px]">{{ llmsTxtJson }}</pre>
      </div>
    </DevtoolsSection>

    <DevtoolsSection text="Full Response" icon="carbon:code" :open="false">
      <div v-if="fullJson" class="relative">
        <DevtoolsCopyButton :text="fullJson" class="absolute top-2 right-2 z-10" />
        <pre class="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text)] overflow-auto max-h-[600px]">{{ fullJson }}</pre>
      </div>
    </DevtoolsSection>
  </div>
</template>
