import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { PageIndexedContext } from '../../types'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { isPageFresh, queryPages, upsertPage } from '../db/queries'
import { logger } from '../logger'
import { convertHtmlToMarkdownMeta } from '../utils'
import { extractKeywords, stripMarkdown } from './keywords'

// Header to identify internal indexing requests
export const INDEXING_HEADER = 'x-ai-ready-indexing'

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

  const db = await useDatabase(event)
  const ttl = options.ttl ?? config.runtimeSync.ttl

  // Check if already indexed and fresh (unless force)
  if (!options.force && await isPageFresh(db, route, ttl)) {
    logger.debug(`[indexPage] Skipping ${route} - still fresh`)
    return { success: true, skipped: true, isUpdate: true }
  }

  const existing = await queryPages(db, { route })
  const isUpdate = !!existing

  // Check for error pages
  const isError = html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')

  const result = await convertHtmlToMarkdownMeta(html, route, config.mdreamOptions)
  const updatedAt = result.updatedAt || new Date().toISOString()
  const headings = JSON.stringify(result.headings)
  const keywords = extractKeywords(stripMarkdown(result.markdown), result.metaKeywords)

  await upsertPage(db, {
    route,
    title: result.title,
    description: result.description,
    markdown: result.markdown,
    headings,
    keywords,
    updatedAt,
    isError,
  })

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
  event: H3Event,
  options: IndexPageOptions = {},
): Promise<IndexPageResult> {
  const html = await event.$fetch(route, {
    headers: { [INDEXING_HEADER]: '1' },
  }).catch((err: Error) => {
    logger.warn(`[indexPageByRoute] Failed to fetch ${route}:`, err.message)
    return null
  }) as string | null

  if (!html || typeof html !== 'string') {
    // Mark as error in DB to prevent retry loops
    if (options.markFailedAsError) {
      const db = await useDatabase(event)
      await upsertPage(db, {
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
