<script lang="ts" setup>
import { computed } from 'vue'
import { data } from '../../lib/ai-ready/state'

const config = computed(() => data.value?.config)
const llmsTxt = computed(() => data.value?.llmsTxt)

const configJson = computed(() => config.value ? JSON.stringify(config.value, null, 2) : '')
const llmsTxtJson = computed(() => llmsTxt.value ? JSON.stringify(llmsTxt.value, null, 2) : '')
const fullJson = computed(() => data.value ? JSON.stringify(data.value, null, 2) : '')
</script>

<template>
  <div class="space-y-4">
    <DevtoolsSection text="Module Config" icon="carbon:settings" :open="true">
      <DevtoolsSnippet v-if="configJson" :code="configJson" lang="json" />
    </DevtoolsSection>

    <DevtoolsSection text="llms.txt Config" icon="carbon:document" :open="true">
      <DevtoolsSnippet v-if="llmsTxtJson" :code="llmsTxtJson" lang="json" />
    </DevtoolsSection>

    <DevtoolsSection text="Full Response" icon="carbon:code" :open="false">
      <DevtoolsSnippet v-if="fullJson" :code="fullJson" lang="json" />
    </DevtoolsSection>
  </div>
</template>
