import type { ModulePublicRuntimeConfig } from '../../../module'
import type { PageIndexedContext } from '../../types'
import { defineNitroPlugin, useRuntimeConfig, useStorage } from 'nitropack/runtime'
import { logger } from '../logger'
import { convertHtmlToMarkdownMeta } from '../utils'
import { extractKeywords, stripMarkdown } from '../utils/keywords'

export default defineNitroPlugin((nitro) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig & {
    runtimeIndexing?: { enabled?: boolean, storage?: string, ttl?: number }
  }

  if (!config.runtimeIndexing?.enabled)
    return

  const storagePrefix = config.runtimeIndexing.storage || 'ai-ready'
  const ttl = config.runtimeIndexing.ttl || 0

  nitro.hooks.hook('afterResponse', (event, response) => {
    const body = response?.body
    // Skip non-HTML, internal, API routes
    const path = event.path
    if (
      path.startsWith('/api')
      || path.startsWith('/_')
      || path.startsWith('/@')
      || path.endsWith('.md')
      || path.includes('.')
    ) {
      return
    }

    // Skip if not HTML response
    const contentType = event.node.res.getHeader('content-type')
    if (!contentType?.toString().includes('text/html'))
      return

    // Skip error responses
    const status = event.node.res.statusCode
    if (status >= 400)
      return

    event.waitUntil((async () => {
      const storage = useStorage(storagePrefix)
      const html = typeof body === 'string' ? body : null

      if (!html) {
        logger.debug(`[runtime-indexing] Skipping ${path} - no HTML body`)
        return
      }

      // Check if page is already indexed and fresh
      const routeKey = normalizeRouteKey(path)
      const existing = await storage.getItem<{ indexedAt: number }>(`pages:${routeKey}`)
      const isUpdate = !!existing
      if (existing && ttl > 0) {
        const age = (Date.now() - existing.indexedAt) / 1000
        if (age < ttl) {
          logger.debug(`[runtime-indexing] Skipping ${path} - still fresh (${Math.round(age)}s old)`)
          return
        }
      }

      // Skip error pages
      if (html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')) {
        await storage.setItem(`errors:${routeKey}`, { route: path, indexedAt: Date.now() })
        logger.debug(`[runtime-indexing] Indexed error route: ${path}`)
        return
      }

      const result = await convertHtmlToMarkdownMeta(html, path, config.mdreamOptions)

      const updatedAt = result.updatedAt || new Date().toISOString()
      const headings = JSON.stringify(result.headings)
      const keywords = extractKeywords(stripMarkdown(result.markdown), result.metaKeywords)

      const pageData = {
        route: path,
        title: result.title,
        description: result.description,
        headings,
        keywords,
        markdown: result.markdown,
        updatedAt,
        indexedAt: Date.now(),
      }

      await storage.setItem(`pages:${routeKey}`, pageData)
      logger.debug(`[runtime-indexing] Indexed: ${path} "${result.title}"`)

      // Call hook for external integrations (embeddings, search, etc)
      const hookContext: PageIndexedContext = {
        route: path,
        title: result.title,
        description: result.description,
        headings,
        keywords,
        markdown: result.markdown,
        updatedAt,
        isUpdate,
      }
      await nitro.hooks.callHook('ai-ready:page:indexed', hookContext)
    })().catch((err) => {
      logger.error(`[runtime-indexing] Failed to index ${path}:`, err)
    }))
  })
})

function normalizeRouteKey(path: string): string {
  // Convert /about/team -> about:team for storage key
  return path.replace(/^\//, '').replace(/\//g, ':') || 'index'
}
