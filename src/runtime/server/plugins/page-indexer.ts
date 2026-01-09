import type { ModulePublicRuntimeConfig } from '../../../module'
import type { PageIndexedContext } from '../../types'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { getPage, isPageFresh, upsertPage } from '../db/queries'
import { logger } from '../logger'
import { convertHtmlToMarkdownMeta } from '../utils'
import { extractKeywords, stripMarkdown } from '../utils/keywords'

export default defineNitroPlugin((nitro) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const ttl = config.ttl ?? 0

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
      const html = typeof body === 'string' ? body : null

      if (!html) {
        logger.debug(`[runtime-indexing] Skipping ${path} - no HTML body`)
        return
      }

      const db = await useDatabase(event)

      // Check if page is already indexed and fresh
      if (ttl > 0 && await isPageFresh(db, path, ttl)) {
        logger.debug(`[runtime-indexing] Skipping ${path} - still fresh`)
        return
      }

      const existing = await getPage(db, path)
      const isUpdate = !!existing

      // Skip error pages
      const isError = html.includes('__NUXT_ERROR__') || html.includes('nuxt-error-page')

      const result = await convertHtmlToMarkdownMeta(html, path, config.mdreamOptions)
      const updatedAt = result.updatedAt || new Date().toISOString()
      const headings = JSON.stringify(result.headings)
      const keywords = extractKeywords(stripMarkdown(result.markdown), result.metaKeywords)

      await upsertPage(db, {
        route: path,
        title: result.title,
        description: result.description,
        markdown: result.markdown,
        headings,
        keywords,
        updatedAt,
        isError,
      })

      logger.debug(`[runtime-indexing] Indexed: ${path} "${result.title}"`)

      // Call hook for external integrations (embeddings, search, etc)
      if (!isError) {
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
      }
    })().catch((err) => {
      logger.error(`[runtime-indexing] Failed to index ${path}:`, err)
    }))
  })
})
