import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { PageIndexedContext } from '../../types'
import { useNitroApp, useRuntimeConfig, useStorage } from 'nitropack/runtime'
import { logger } from '../logger'
import { convertHtmlToMarkdownMeta } from '../utils'
import { extractKeywords, stripMarkdown } from './keywords'

export interface IndexPageOptions {
  /** Skip if page was indexed within TTL (uses config ttl if not specified) */
  ttl?: number
  /** Force re-index even if fresh */
  force?: boolean
  /** Skip calling the ai-ready:page:indexed hook */
  skipHook?: boolean
}

export interface IndexPageResult {
  success: boolean
  /** True if page was already fresh and skipped */
  skipped?: boolean
  /** True if this was an update vs new index */
  isUpdate?: boolean
  /** Page data if successful */
  data?: {
    route: string
    title: string
    description: string
    headings: string
    keywords: string[]
    markdown: string
    updatedAt: string
  }
  /** Error message if failed */
  error?: string
}

/**
 * Manually index a page's HTML content into storage
 * Use this from custom plugins or API routes to trigger indexing
 *
 * @example
 * // In a Nitro plugin
 * nitro.hooks.hook('request', async (event) => {
 *   if (shouldIndex(event)) {
 *     const html = await fetchHtml(event.path)
 *     await indexPage(event.path, html)
 *   }
 * })
 *
 * @example
 * // In an API route to re-index a page
 * export default defineEventHandler(async (event) => {
 *   const { path } = await readBody(event)
 *   const html = await $fetch(path)
 *   return indexPage(path, html, { force: true })
 * })
 */
export async function indexPage(
  route: string,
  html: string,
  options: IndexPageOptions = {},
): Promise<IndexPageResult> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig & {
    runtimeIndexing?: { enabled?: boolean, storage?: string, ttl?: number }
  }

  if (!config.runtimeIndexing?.enabled) {
    return { success: false, error: 'Runtime indexing is not enabled' }
  }

  const storagePrefix = config.runtimeIndexing.storage || 'ai-ready'
  const ttl = options.ttl ?? config.runtimeIndexing.ttl ?? 0
  const storage = useStorage(storagePrefix)
  const routeKey = normalizeRouteKey(route)

  // Check if already indexed and fresh (unless force)
  if (!options.force) {
    const existing = await storage.getItem<{ indexedAt: number }>(`pages:${routeKey}`)
    if (existing && ttl > 0) {
      const age = (Date.now() - existing.indexedAt) / 1000
      if (age < ttl) {
        logger.debug(`[indexPage] Skipping ${route} - still fresh (${Math.round(age)}s old)`)
        return { success: true, skipped: true, isUpdate: true }
      }
    }
  }

  const existing = await storage.getItem<{ indexedAt: number }>(`pages:${routeKey}`)
  const isUpdate = !!existing

  // Check for error pages
  if (html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')) {
    await storage.setItem(`errors:${routeKey}`, { route, indexedAt: Date.now() })
    logger.debug(`[indexPage] Indexed error route: ${route}`)
    return { success: true, isUpdate }
  }

  const result = await convertHtmlToMarkdownMeta(html, route, config.mdreamOptions)
  const updatedAt = result.updatedAt || new Date().toISOString()
  const headings = JSON.stringify(result.headings)
  const keywords = extractKeywords(stripMarkdown(result.markdown), result.metaKeywords)

  const pageData = {
    route,
    title: result.title,
    description: result.description,
    headings,
    keywords,
    markdown: result.markdown,
    updatedAt,
    indexedAt: Date.now(),
  }

  await storage.setItem(`pages:${routeKey}`, pageData)
  logger.debug(`[indexPage] Indexed: ${route} "${result.title}"`)

  // Call hook unless skipped
  if (!options.skipHook) {
    const nitro = useNitroApp()
    const hookContext: PageIndexedContext = {
      route,
      title: result.title,
      description: result.description,
      headings,
      keywords,
      markdown: result.markdown,
      updatedAt,
      isUpdate,
    }
    await nitro.hooks.callHook('ai-ready:page:indexed', hookContext)
  }

  return {
    success: true,
    isUpdate,
    data: {
      route,
      title: result.title,
      description: result.description,
      headings,
      keywords,
      markdown: result.markdown,
      updatedAt,
    },
  }
}

/**
 * Index a page by fetching its HTML first
 * Convenience wrapper around indexPage that handles fetching
 */
export async function indexPageByRoute(
  route: string,
  event?: H3Event,
  options: IndexPageOptions = {},
): Promise<IndexPageResult> {
  const fetchFn = event?.fetch || globalThis.$fetch

  const html = await fetchFn(route, {
    headers: { 'x-ai-ready-internal': '1' },
  }).catch((err: Error) => {
    logger.error(`[indexPageByRoute] Failed to fetch ${route}:`, err)
    return null
  }) as string | null

  if (!html) {
    return { success: false, error: `Failed to fetch HTML for ${route}` }
  }

  if (typeof html !== 'string') {
    return { success: false, error: `Response for ${route} is not HTML` }
  }

  return indexPage(route, html, options)
}

function normalizeRouteKey(path: string): string {
  return path.replace(/^\//, '').replace(/\//g, ':') || 'index'
}
