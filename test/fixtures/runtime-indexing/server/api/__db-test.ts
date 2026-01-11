import { countPages, getStaleRoutes, pruneStaleRoutes, queryPages, searchPages, upsertPage, useDatabase } from '#ai-ready'
import { defineEventHandler, getQuery, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { action, ...params } = getQuery(event) as { action: string, [k: string]: unknown }
  const db = await useDatabase(event)

  switch (action) {
    case 'count':
      return { count: await countPages(db) }

    case 'list':
      return { pages: await queryPages(db) }

    case 'get':
      return { page: await queryPages(db, { route: params.route as string }) }

    case 'search':
      return { results: await searchPages(db, params.q as string, { limit: Number(params.limit) || 10 }) }

    case 'upsert': {
      const body = await readBody(event)
      await upsertPage(db, body)
      return { success: true }
    }

    case 'stale':
      return { routes: await getStaleRoutes(db, Number(params.ttl) || 604800) }

    case 'prune':
      return { pruned: await pruneStaleRoutes(db, Number(params.ttl) || 604800) }

    case 'raw': {
      // For testing: execute raw SQL to manipulate last_seen_at
      const rows = await db.all<{ route: string, last_seen_at: number }>('SELECT route, last_seen_at FROM ai_ready_pages')
      return { rows }
    }

    case 'set-last-seen': {
      // For testing: set last_seen_at for a route
      const { route: r, timestamp } = await readBody(event) as { route: string, timestamp: number }
      await db.exec('UPDATE ai_ready_pages SET last_seen_at = ? WHERE route = ?', [timestamp, r])
      return { success: true }
    }

    case 'set-source': {
      // For testing: set source for a route
      const { route: r, source } = await readBody(event) as { route: string, source: 'prerender' | 'runtime' }
      await db.exec('UPDATE ai_ready_pages SET source = ? WHERE route = ?', [source, r])
      return { success: true }
    }

    default:
      return { error: 'Unknown action' }
  }
})
