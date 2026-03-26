<script lang="ts" setup>
import { hasProductionUrl, isProductionMode, previewSource } from 'nuxtseo-layer-devtools/composables/state'
import { computed, inject } from 'vue'
import { GlobalDataKey } from '../composables/types'

const globalData = inject(GlobalDataKey)

const config = computed(() => globalData?.value?.config)
const stats = computed(() => globalData?.value?.stats)
const isDev = computed(() => globalData?.value?.isDev ?? true)
const hasSiteUrl = computed(() => hasProductionUrl.value)
</script>

<template>
  <div class="space-y-6">
    <!-- Production CTA Banner (dev mode, no production URL) -->
    <DevtoolsAlert
      v-if="isDev && !hasSiteUrl"
      variant="info"
    >
      <p class="font-medium mb-2">
        Configure your site URL to preview production data
      </p>
      <p class="mb-3 text-sm opacity-80">
        Page data, search, and llms.txt content are only available after prerendering or from a production site.
        Add your production URL to inspect live data from this panel.
      </p>
      <DevtoolsSnippet
        lang="js"
        code="`// nuxt.config.ts\nexport default defineNuxtConfig({\n  site: { url: 'https://your-site.com' },\n})`"
      />
    </DevtoolsAlert>

    <!-- Production CTA Banner (dev mode, has production URL) -->
    <DevtoolsAlert
      v-if="isDev && hasSiteUrl && !isProductionMode"
      variant="production"
    >
      <p class="font-medium mb-2">
        Production data available
      </p>
      <p class="mb-3 text-sm opacity-80">
        In development, the database is empty and llms.txt is a stub.
        Switch to production mode to see indexed pages, search results, and live llms.txt content.
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--seo-green)] text-white hover:opacity-90 transition-opacity cursor-pointer"
        @click="previewSource = 'production'"
      >
        <UIcon name="carbon:cloud" class="w-3.5 h-3.5" />
        Switch to Production
      </button>
    </DevtoolsAlert>

    <!-- Production Stats -->
    <div v-if="stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <DevtoolsMetric
        label="Total Pages"
        :value="stats.total"
        icon="carbon:document-multiple"
      />
      <DevtoolsMetric
        label="Indexed"
        :value="stats.indexed"
        icon="carbon:checkmark-filled"
        variant="success"
      />
      <DevtoolsMetric
        label="Pending"
        :value="stats.pending"
        icon="carbon:time"
        :variant="stats.pending > 0 ? 'warning' : 'default'"
      />
      <DevtoolsMetric
        label="Errors"
        :value="stats.errors"
        icon="carbon:warning-alt"
        :variant="stats.errors > 0 ? 'danger' : 'default'"
      />
    </div>

    <!-- Configuration Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <!-- Database -->
      <DevtoolsPanel title="Database">
        <div class="config-row">
          <span class="config-label">Type</span>
          <span class="config-value">{{ config?.database?.type || 'sqlite' }}</span>
        </div>
      </DevtoolsPanel>

      <!-- MCP -->
      <DevtoolsPanel title="MCP Server">
        <template v-if="config?.mcp?.enabled">
          <div class="config-row">
            <span class="config-label">Tools</span>
            <span class="config-value" :class="config.mcp.tools ? 'text-green-500' : ''">{{ config.mcp.tools ? 'Enabled' : 'Disabled' }}</span>
          </div>
          <div class="config-row">
            <span class="config-label">Resources</span>
            <span class="config-value" :class="config.mcp.resources ? 'text-green-500' : ''">{{ config.mcp.resources ? 'Enabled' : 'Disabled' }}</span>
          </div>
        </template>
        <p v-else class="text-xs text-[var(--color-text-muted)]">
          Not installed. Add <code class="px-1 py-0.5 rounded bg-[var(--color-surface-sunken)]">@nuxtjs/mcp-toolkit</code> to enable.
        </p>
      </DevtoolsPanel>

      <!-- IndexNow -->
      <DevtoolsPanel title="IndexNow">
        <div class="config-row">
          <span class="config-label">Status</span>
          <span class="config-value" :class="config?.indexNow ? 'text-green-500' : ''">
            {{ config?.indexNow ? 'Enabled' : 'Disabled' }}
          </span>
        </div>
      </DevtoolsPanel>

      <!-- Content Signals -->
      <DevtoolsPanel title="Content Signals">
        <template v-if="config?.contentSignal">
          <div class="config-row">
            <span class="config-label">AI Train</span>
            <span class="config-value">{{ config.contentSignal.aiTrain ? 'Yes' : 'No' }}</span>
          </div>
          <div class="config-row">
            <span class="config-label">Search</span>
            <span class="config-value">{{ config.contentSignal.search ? 'Yes' : 'No' }}</span>
          </div>
          <div class="config-row">
            <span class="config-label">AI Input</span>
            <span class="config-value">{{ config.contentSignal.aiInput ? 'Yes' : 'No' }}</span>
          </div>
        </template>
        <p v-else class="text-xs text-[var(--color-text-muted)]">
          Not configured. Uses default robot directives.
        </p>
      </DevtoolsPanel>

      <!-- Runtime Sync -->
      <DevtoolsPanel title="Runtime Sync">
        <template v-if="config?.runtimeSync?.enabled">
          <div class="config-row">
            <span class="config-label">TTL</span>
            <span class="config-value">{{ config.runtimeSync.ttl }}s</span>
          </div>
          <div class="config-row">
            <span class="config-label">Batch Size</span>
            <span class="config-value">{{ config.runtimeSync.batchSize }}</span>
          </div>
          <div class="config-row">
            <span class="config-label">Prune TTL</span>
            <span class="config-value">{{ config.runtimeSync.pruneTtl ? `${config.runtimeSync.pruneTtl}s` : 'Never' }}</span>
          </div>
        </template>
        <p v-else class="text-xs text-[var(--color-text-muted)]">
          Disabled. Using prerendered data only.
        </p>
      </DevtoolsPanel>

      <!-- Cron & Cache -->
      <DevtoolsPanel title="Scheduled Tasks">
        <div class="config-row">
          <span class="config-label">Cron</span>
          <span class="config-value">{{ config?.cron ? 'Every 5 minutes' : 'Disabled' }}</span>
        </div>
        <div class="config-row">
          <span class="config-label">Sitemap Prerendered</span>
          <span class="config-value">{{ config?.sitemapPrerendered ? 'Yes' : 'No' }}</span>
        </div>
      </DevtoolsPanel>
    </div>

    <!-- Cache Settings -->
    <DevtoolsSection text="Cache Settings" icon="carbon:timer">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="config-row">
          <span class="config-label">Markdown Max-Age</span>
          <span class="config-value font-mono">{{ config?.markdownCacheHeaders?.maxAge || 3600 }}s</span>
        </div>
        <div class="config-row">
          <span class="config-label">Markdown SWR</span>
          <span class="config-value">{{ config?.markdownCacheHeaders?.swr ? 'Enabled' : 'Disabled' }}</span>
        </div>
        <div class="config-row">
          <span class="config-label">llms.txt Cache</span>
          <span class="config-value font-mono">{{ config?.llmsTxtCacheSeconds || 600 }}s</span>
        </div>
      </div>
    </DevtoolsSection>
  </div>
</template>

<style scoped>
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--color-border-subtle);
}

.config-row:last-child {
  border-bottom: none;
}

.config-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.config-value {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text);
}
</style>
