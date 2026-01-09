import type { ModulePublicRuntimeConfig } from '../../../../module'
import type { PageIndexedContext } from '../../../types'
import { eventHandler, getQuery } from 'h3'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../../db'
import { getNextUnindexedRoute, getUnindexedCount, upsertPage } from '../../db/queries'
import { logger } from '../../logger'
import { convertHtmlToMarkdownMeta } from '../../utils'
import { extractKeywords, stripMarkdown } from '../../utils/keywords'

const INTERNAL_HEADER = 'x-ai-ready-indexing'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 10, 50) // Max 50 per request

  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const db = await useDatabase(event)
  const nitro = useNitroApp()

  const beforeCount = await getUnindexedCount(db)
  if (beforeCount === 0) {
    return { indexed: 0, remaining: 0 }
  }

  let indexed = 0
  const errors: string[] = []

  for (let i = 0; i < limit; i++) {
    const route = await getNextUnindexedRoute(db)
    if (!route)
      break

    const html = await event.$fetch(route, {
      headers: { [INTERNAL_HEADER]: '1' },
    }).catch((err: Error) => {
      logger.warn(`[poll] Failed to fetch ${route}:`, err.message)
      errors.push(route)
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
      continue
    }

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

    indexed++
    logger.debug(`[poll] Indexed: ${route}`)

    if (!isError) {
      const hookContext: PageIndexedContext = {
        route,
        title: result.title,
        description: result.description,
        headings,
        keywords,
        markdown: result.markdown,
        updatedAt,
        isUpdate: false,
      }
      await nitro.hooks.callHook('ai-ready:page:indexed', hookContext)
    }
  }

  const remaining = await getUnindexedCount(db)

  return {
    indexed,
    remaining,
    errors: errors.length > 0 ? errors : undefined,
  }
})
