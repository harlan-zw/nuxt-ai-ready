import type { ModulePublicRuntimeConfig } from '../../../module'
import type { PageIndexedContext } from '../../types'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { getNextUnindexedRoute, getPage, upsertPage } from '../db/queries'
import { logger } from '../logger'
import { convertHtmlToMarkdownMeta } from '../utils'
import { extractKeywords, stripMarkdown } from '../utils/keywords'

// Header to identify internal indexing requests
const INTERNAL_HEADER = 'x-ai-ready-indexing'

export default defineNitroPlugin((nitro) => {
  // Skip during prerender - handled by prerender.ts via JSONL
  if (import.meta.prerender)
    return

  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  nitro.hooks.hook('afterResponse', (event) => {
    // Skip internal indexing requests to avoid infinite loop
    if (event.node.req.headers[INTERNAL_HEADER])
      return

    event.waitUntil((async () => {
      const db = await useDatabase(event)

      // Get next unindexed route
      const route = await getNextUnindexedRoute(db)
      if (!route) {
        return // All pages indexed
      }

      logger.debug(`[page-indexer] Indexing: ${route}`)

      // Fetch page internally (no user cookies = public version)
      const html = await event.$fetch(route, {
        headers: { [INTERNAL_HEADER]: '1' },
      }).catch((err: Error) => {
        logger.warn(`[page-indexer] Failed to fetch ${route}:`, err.message)
        return null
      }) as string | null

      if (!html || typeof html !== 'string') {
        // Mark as indexed with error to prevent retry loop
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
        return
      }

      // Check for error pages
      const isError = html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')

      const existing = await getPage(db, route)
      const isUpdate = !!existing

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

      logger.debug(`[page-indexer] Indexed: ${route} "${result.title}"`)

      // Call hook for external integrations
      if (!isError) {
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
    })().catch((err) => {
      logger.error('[page-indexer] Error:', err)
    }))
  })
})
