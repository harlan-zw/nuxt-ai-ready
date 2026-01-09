import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineNitroPlugin, useRuntimeConfig, useStorage } from 'nitropack/runtime'
import { logger } from '../logger'

/**
 * On server start, load prerendered page data into storage
 * This allows runtime indexing to add new pages to the same storage
 */
export default defineNitroPlugin(async () => {
  // Skip during prerendering - data is still being generated
  if (import.meta.prerender)
    return

  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig & {
    runtimeIndexing?: { enabled?: boolean, storage?: string }
  }

  if (!config.runtimeIndexing?.enabled)
    return

  const storagePrefix = config.runtimeIndexing.storage || 'ai-ready'
  const storage = useStorage(storagePrefix)

  // Check if storage is already populated
  const existingKeys = await storage.getKeys('pages:')
  if (existingKeys.length > 0) {
    logger.debug(`[storage-init] Storage already has ${existingKeys.length} pages, skipping init`)
    return
  }

  // Try to load prerendered data from public JSON file
  const prerenderedData = await loadPrerenderedData()
  if (!prerenderedData || prerenderedData.pages.length === 0) {
    logger.debug('[storage-init] No prerendered data found, starting fresh')
    return
  }

  // Populate storage with prerendered pages
  const now = Date.now()
  await Promise.all(
    prerenderedData.pages.map(async (page) => {
      const routeKey = normalizeRouteKey(page.route)
      await storage.setItem(`pages:${routeKey}`, {
        route: page.route,
        title: page.title,
        description: page.description,
        headings: page.headings,
        updatedAt: page.updatedAt,
        markdown: '', // Not stored in pages.json, would need llms-full.txt parsing
        indexedAt: now,
      })
    }),
  )

  // Also populate error routes
  if (prerenderedData.errorRoutes?.length) {
    await Promise.all(
      prerenderedData.errorRoutes.map(route =>
        storage.setItem(`errors:${normalizeRouteKey(route)}`, { route, indexedAt: now }),
      ),
    )
  }

  logger.info(`[storage-init] Loaded ${prerenderedData.pages.length} prerendered pages into storage`)
})

interface PrerenderedData {
  pages: Array<{
    route: string
    title: string
    description: string
    headings: string
    updatedAt: string
  }>
  errorRoutes?: string[]
}

async function loadPrerenderedData(): Promise<PrerenderedData | null> {
  return globalThis.$fetch('/__ai-ready/pages.json', { baseURL: '/' })
    .catch(() => null) as Promise<PrerenderedData | null>
}

function normalizeRouteKey(path: string): string {
  return path.replace(/^\//, '').replace(/\//g, ':') || 'index'
}
