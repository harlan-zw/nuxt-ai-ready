import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { PageIndexedContext } from '../../types'
import { fetchWithEvent, useNitroApp, useRuntimeConfig } from '#nuxtseo/nitro'
import { getPageIndexState, upsertPage } from '../db/queries'
import { computeContentHash } from '../db/shared'
import { logger } from '../logger'
import { convertHtmlToMarkdown } from '../utils'
import { createUniversalContext } from './context'
import { extractKeywords } from './keywords'
import { INTERNAL_HEADER } from './negotiation-decision'

export interface IndexPageOptions {
  /** Skip if page was indexed within TTL (uses config ttl if not specified) */
  ttl?: number
  /** Force re-index even if fresh */
  force?: boolean
  /** Skip calling the ai-ready:page:indexed hook */
  skipHook?: boolean
  /** Mark failed fetches as errors in DB to prevent retry loops */
  markFailedAsError?: boolean
}

export interface IndexPageResult {
  success: boolean
  /** True if page was already fresh and skipped */
  skipped?: boolean
  /** True if this was an update vs new index */
  isUpdate?: boolean
  /** True if content actually changed (hash differs from previous) */
  contentChanged?: boolean
  /** Page data if successful */
  data?: {
    route: string
    title: string
    description: string
    headings: string
    keywords: string[]
    markdown: string
    contentHash: string
    updatedAt: string
  }
  /** Error message if failed */
  error?: string
}

/**
 * Manually index a page's HTML content into database
 * Use this from custom plugins or API routes to trigger indexing
 */
export async function indexPage(
  route: string,
  html: string,
  options: IndexPageOptions = {},
  event?: H3Event,
): Promise<IndexPageResult> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const ttl = options.ttl ?? config.runtimeSync.ttl

  // Single lightweight row read covers freshness, existence, and prior hash
  // (previously three queries per page, one of which was a full `SELECT *`).
  const state = await getPageIndexState(event, route)

  // Check if already indexed and fresh (unless force)
  if (!options.force && ttl > 0 && state && (Date.now() - state.indexedAt) / 1000 < ttl) {
    logger.debug(`[indexPage] Skipping ${route} - still fresh`)
    return { success: true, skipped: true, isUpdate: true }
  }

  const isUpdate = !!state

  // Check for error pages
  const isError = html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')

  const { siteUrl } = createUniversalContext(event)
  const fullUrl = siteUrl ? `${siteUrl}${route}` : route
  const result = await convertHtmlToMarkdown(html, fullUrl, config.mdreamOptions, { extractUpdatedAt: true })
  const updatedAt = result.updatedAt || new Date().toISOString()
  const headings = JSON.stringify(result.headings)
  const keywords = extractKeywords(result.textContent, result.metaKeywords)

  // Compute content hash and check for changes
  const contentHash = await computeContentHash(result.markdown)
  const contentChanged = state?.contentHash !== contentHash

  await upsertPage(event, {
    route,
    title: result.title,
    description: result.description,
    markdown: result.markdown,
    headings,
    keywords,
    contentHash,
    updatedAt,
    isError,
  })

  logger.debug(`[indexPage] Indexed: ${route} "${result.title}" (changed=${contentChanged})`)

  // Call hook unless skipped
  if (!options.skipHook) {
    const nitro = useNitroApp()
    const hookContext: PageIndexedContext = {
      route,
      title: result.title,
      description: result.description,
      headings: result.headings,
      keywords,
      markdown: result.markdown,
      updatedAt,
      isUpdate,
      contentChanged,
    }
    await nitro.hooks.callHook('ai-ready:page:indexed', hookContext)
  }

  return {
    success: true,
    isUpdate,
    contentChanged,
    data: {
      route,
      title: result.title,
      description: result.description,
      headings,
      keywords,
      markdown: result.markdown,
      contentHash,
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
  event: H3Event | undefined,
  options: IndexPageOptions = {},
): Promise<IndexPageResult> {
  logger.debug(`[indexPageByRoute] Fetching HTML for ${route} (timeout: 10000ms)`)
  const html = await (event
    ? fetchWithEvent(event, route, {
        headers: { accept: 'text/html', [INTERNAL_HEADER]: '1' },
        timeout: 10000,
      })
    : globalThis.$fetch(route, {
        headers: { accept: 'text/html', [INTERNAL_HEADER]: '1' },
        timeout: 10000, // 10s timeout per page (must fit within CF worker limit)
      })).catch((err: Error) => {
    logger.warn(`[indexPageByRoute] Failed to fetch ${route}:`, err.message)
    return null
  }) as string | null

  if (html) {
    logger.debug(`[indexPageByRoute] Fetched ${route} (${html.length} bytes)`)
  }

  if (!html || typeof html !== 'string') {
    // Mark as error in DB to prevent retry loops
    if (options.markFailedAsError) {
      await upsertPage(event, {
        route,
        title: '',
        description: '',
        markdown: '',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
        isError: true,
      })
    }
    return { success: false, error: `Failed to fetch HTML for ${route}` }
  }

  return indexPage(route, html, options, event)
}
