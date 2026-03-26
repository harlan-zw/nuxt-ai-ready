<script lang="ts" setup>
import { useAsyncData } from '#imports'
import { appFetch } from 'nuxtseo-layer-devtools/composables/rpc'
import { isProductionMode, refreshTime } from 'nuxtseo-layer-devtools/composables/state'
import { computed, inject, ref } from 'vue'
import { GlobalDataKey } from '../composables/types'

const globalData = inject(GlobalDataKey)
const isDev = computed(() => globalData?.value?.isDev ?? true)
const llmsTxtConfig = computed(() => globalData?.value?.llmsTxt)

const activeTab = ref<'llms-txt' | 'llms-full'>('llms-txt')

// Fetch actual llms.txt content
const { data: llmsTxtContent } = useAsyncData('llms-txt-content', async () => {
  if (!appFetch.value)
    return null
  try {
    return await appFetch.value('/llms.txt', { responseType: 'text' }) as string
  }
  catch {
    return null
  }
}, {
  watch: [appFetch, refreshTime],
})

const { data: llmsFullContent, status: fullStatus } = useAsyncData('llms-full-content', async () => {
  if (!appFetch.value || activeTab.value !== 'llms-full')
    return null
  try {
    return await appFetch.value('/llms-full.txt', { responseType: 'text' }) as string
  }
  catch {
    return null
  }
}, {
  watch: [appFetch, refreshTime, activeTab],
})

const displayContent = computed(() => {
  if (activeTab.value === 'llms-full')
    return llmsFullContent.value
  return llmsTxtContent.value
})

// Build a template preview from config (for dev mode)
const templatePreview = computed(() => {
  const config = llmsTxtConfig.value
  if (!config)
    return ''

  const lines: string[] = ['# {Site Name}', '', '> {Site Description}', '']

  for (const section of config.sections || []) {
    lines.push(`## ${section.title}`)
    if (section.description) {
      const descs = Array.isArray(section.description) ? section.description : [section.description]
      for (const d of descs)
        lines.push('', d)
    }
    for (const link of section.links || []) {
      const desc = link.description ? `: ${link.description}` : ''
      lines.push(`- [${link.title}](${link.href})${desc}`)
    }
    lines.push('')
  }

  if (config.notes) {
    const notes = Array.isArray(config.notes) ? config.notes : [config.notes]
    for (const note of notes)
      lines.push(note)
  }

  return lines.join('\n')
})
</script>

<template>
  <div class="space-y-4">
    <!-- Tab switcher -->
    <div class="flex items-center gap-2">
      <button
        v-for="tab in [{ key: 'llms-txt', label: 'llms.txt' }, { key: 'llms-full', label: 'llms-full.txt' }]"
        :key="tab.key"
        type="button"
        class="px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer"
        :class="activeTab === tab.key
          ? 'bg-[var(--seo-green)] text-white'
          : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'"
        @click="activeTab = tab.key as any"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Dev mode: template preview hint -->
    <DevtoolsAlert
      v-if="isDev && !isProductionMode"
      variant="info"
    >
      <p class="font-medium mb-1">
        Template Preview
      </p>
      <p class="text-sm opacity-80">
        This shows the llms.txt structure from your config. Actual content with page data is generated during prerendering.
        Switch to production mode to see live content.
      </p>
    </DevtoolsAlert>

    <!-- Content display -->
    <DevtoolsPanel :title="activeTab === 'llms-txt' ? 'llms.txt' : 'llms-full.txt'">
      <!-- Loading state for llms-full.txt -->
      <div v-if="activeTab === 'llms-full' && fullStatus === 'pending'" class="py-8 text-center">
        <DevtoolsLoading />
      </div>

      <!-- Show content or template -->
      <template v-else>
        <div v-if="displayContent" class="relative">
          <DevtoolsCopyButton :text="displayContent" class="absolute top-2 right-2 z-10" />
          <pre class="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text)] overflow-auto max-h-[600px]">{{ displayContent }}</pre>
        </div>

        <!-- Fallback: show template preview in dev -->
        <div v-else-if="isDev && templatePreview" class="relative">
          <pre class="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] overflow-auto max-h-[600px]">{{ templatePreview }}</pre>
        </div>

        <DevtoolsEmptyState
          v-else
          icon="carbon:document"
          title="No content available"
          description="llms.txt content is generated during prerendering. Run `nuxi generate` or switch to production mode."
        />
      </template>
    </DevtoolsPanel>

    <!-- llms.txt Structure (always visible) -->
    <DevtoolsSection text="Configured Sections" icon="carbon:list-boxes">
      <div v-if="llmsTxtConfig?.sections?.length" class="space-y-3">
        <div
          v-for="(section, i) in llmsTxtConfig.sections"
          :key="i"
          class="p-3 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)]"
        >
          <h4 class="text-sm font-semibold text-[var(--color-text)] mb-1">
            {{ section.title }}
          </h4>
          <div v-if="section.links?.length" class="space-y-1 mt-2">
            <div
              v-for="(link, j) in section.links"
              :key="j"
              class="flex items-start gap-2 text-xs"
            >
              <UIcon name="carbon:link" class="w-3 h-3 mt-0.5 text-[var(--color-text-muted)]" />
              <div>
                <span class="font-medium text-[var(--color-text)]">{{ link.title }}</span>
                <span v-if="link.description" class="text-[var(--color-text-muted)]">, {{ link.description }}</span>
                <div class="font-mono text-[var(--color-text-subtle)]">
                  {{ link.href }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="text-xs text-[var(--color-text-muted)]">
        No custom sections configured.
      </p>
    </DevtoolsSection>
  </div>
</template>
