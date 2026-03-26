<script lang="ts" setup>
import { useAsyncData } from '#imports'
import { appFetch } from 'nuxtseo-layer-devtools/composables/rpc'
import { hasProductionUrl, isProductionMode, previewSource } from 'nuxtseo-layer-devtools/composables/state'
import { computed, inject, ref } from 'vue'
import { GlobalDataKey } from '../composables/types'

const globalData = inject(GlobalDataKey)
const isDev = computed(() => globalData?.value?.isDev ?? true)
const pages = computed(() => globalData?.value?.pages || [])

const search = ref('')
const selectedRoute = ref<string | null>(null)

const filteredPages = computed(() => {
  if (!search.value)
    return pages.value
  const q = search.value.toLowerCase()
  return pages.value.filter(p =>
    p.route.toLowerCase().includes(q)
    || p.title?.toLowerCase().includes(q)
    || p.description?.toLowerCase().includes(q),
  )
})

// Fetch markdown for selected page
const { data: markdownContent, status: mdStatus } = useAsyncData('page-markdown', async () => {
  if (!appFetch.value || !selectedRoute.value)
    return null
  try {
    const mdRoute = selectedRoute.value === '/' ? '/index.md' : `${selectedRoute.value}.md`
    return await appFetch.value(mdRoute, { responseType: 'text' }) as string
  }
  catch {
    return null
  }
}, {
  watch: [selectedRoute, appFetch],
})
</script>

<template>
  <div class="space-y-4">
    <!-- Dev mode empty state -->
    <template v-if="isDev && !isProductionMode">
      <DevtoolsEmptyState
        icon="carbon:list"
        title="No pages in development"
        description="Pages are indexed during prerendering or via runtime sync. The database is empty in dev mode."
      >
        <div class="mt-4 space-y-2">
          <button
            v-if="hasProductionUrl"
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--seo-green)] text-white hover:opacity-90 transition-opacity cursor-pointer"
            @click="previewSource = 'production'"
          >
            <UIcon name="carbon:cloud" class="w-3.5 h-3.5" />
            Switch to Production
          </button>
          <p class="text-xs text-[var(--color-text-muted)]">
            Or run <code class="px-1 py-0.5 rounded bg-[var(--color-surface-elevated)]">nuxi generate</code> to populate page data.
          </p>
        </div>
      </DevtoolsEmptyState>
    </template>

    <!-- Page browser (production mode or has pages) -->
    <template v-else>
      <!-- Search -->
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <UIcon name="carbon:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            v-model="search"
            type="text"
            placeholder="Search pages..."
            class="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--seo-green)] transition-colors"
          >
        </div>
        <span class="text-xs text-[var(--color-text-muted)] shrink-0">
          {{ filteredPages.length }} page{{ filteredPages.length === 1 ? '' : 's' }}
        </span>
      </div>

      <!-- Page list -->
      <div v-if="filteredPages.length" class="space-y-1">
        <button
          v-for="page in filteredPages"
          :key="page.route"
          type="button"
          class="w-full text-left p-3 rounded-lg border transition-all cursor-pointer"
          :class="selectedRoute === page.route
            ? 'bg-[var(--color-surface-elevated)] border-[var(--seo-green)]'
            : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]'"
          @click="selectedRoute = selectedRoute === page.route ? null : page.route"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-xs font-mono text-[var(--seo-green)] truncate">
                {{ page.route }}
              </div>
              <div v-if="page.title" class="text-sm font-medium text-[var(--color-text)] truncate mt-0.5">
                {{ page.title }}
              </div>
              <div v-if="page.description" class="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-0.5">
                {{ page.description }}
              </div>
            </div>
            <div v-if="page.updatedAt" class="text-[10px] text-[var(--color-text-subtle)] shrink-0">
              {{ new Date(page.updatedAt).toLocaleDateString() }}
            </div>
          </div>
        </button>
      </div>

      <DevtoolsEmptyState
        v-else-if="search"
        icon="carbon:search"
        title="No matching pages"
        :description="`No pages match &quot;${search}&quot;`"
      />

      <DevtoolsEmptyState
        v-else
        icon="carbon:list"
        title="No pages indexed"
        description="The production site has no indexed pages yet. Ensure prerendering has run."
      />

      <!-- Markdown preview panel -->
      <DevtoolsPanel
        v-if="selectedRoute"
        :title="`${selectedRoute}.md`"
        icon="carbon:document"
      >
        <div v-if="mdStatus === 'pending'" class="py-4">
          <DevtoolsLoading />
        </div>
        <div v-else-if="markdownContent" class="relative">
          <DevtoolsCopyButton :text="markdownContent" class="absolute top-2 right-2 z-10" />
          <pre class="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text)] overflow-auto max-h-[500px]">{{ markdownContent }}</pre>
        </div>
        <p v-else class="text-xs text-[var(--color-text-muted)] p-4">
          Could not load markdown for this route.
        </p>
      </DevtoolsPanel>
    </template>
  </div>
</template>
