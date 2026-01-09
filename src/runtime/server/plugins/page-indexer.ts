import { defineNitroPlugin } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { getNextUnindexedRoute } from '../db/queries'
import { logger } from '../logger'
import { INDEXING_HEADER, indexPageByRoute } from '../utils/indexPage'

export default defineNitroPlugin((nitro) => {
  // Skip during prerender - handled by prerender.ts via JSONL
  if (import.meta.prerender)
    return

  nitro.hooks.hook('afterResponse', (event) => {
    // Skip internal indexing requests to avoid infinite loop
    if (event.node.req.headers[INDEXING_HEADER])
      return

    event.waitUntil((async () => {
      const db = await useDatabase(event)

      // Get next unindexed route
      const route = await getNextUnindexedRoute(db)
      if (!route) {
        return // All pages indexed
      }

      logger.debug(`[page-indexer] Indexing: ${route}`)

      const result = await indexPageByRoute(route, event, {
        markFailedAsError: true,
        force: true, // Skip TTL check since we're indexing unindexed pages
      })

      if (result.success) {
        logger.debug(`[page-indexer] Indexed: ${route} "${result.data?.title}"`)
      }
    })().catch((err) => {
      logger.error('[page-indexer] Error:', err)
    }))
  })
})
