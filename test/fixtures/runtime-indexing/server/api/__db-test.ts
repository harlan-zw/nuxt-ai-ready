import { countPages, getPageLastmods, getStaleRoutes, pruneStaleRoutes, queryPages, searchPages, upsertPage, useRawDb } from '#ai-ready'
import { defineEventHandler, getQuery, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { action, ...params } = getQuery(event) as { action: string, [k: string]: unknown }

  switch (action) {
    case 'count':
      return { count: await countPages(event) }

    case 'list':
      return { pages: await queryPages(event) }

    case 'get':
      return { page: await queryPages(event, { route: params.route as string }) }

    case 'search':
      return { results: await searchPages(event, params.q as string, { limit: Number(params.limit) || 10 }) }

    case 'upsert': {
      const body = await readBody(event)
      await upsertPage(event, body)
      return { success: true }
    }

    case 'stale':
      return { routes: await getStaleRoutes(event, Number(params.ttl) || 604800) }

    case 'prune':
      return { pruned: await pruneStaleRoutes(event, Number(params.ttl) || 604800) }

    case 'raw': {
      // For testing: execute raw SQL to manipulate last_seen_at
      const db = await useRawDb(event)
      const rows = await db.all<{ route: string, last_seen_at: number }>('SELECT route, last_seen_at FROM ai_ready_pages')
      return { rows }
    }

    case 'set-last-seen': {
      // For testing: set last_seen_at for a route
      const db = await useRawDb(event)
      const { route: r, timestamp } = await readBody(event) as { route: string, timestamp: number }
      await db.exec('UPDATE ai_ready_pages SET last_seen_at = ? WHERE route = ?', [timestamp, r])
      return { success: true }
    }

    case 'set-source': {
      // For testing: set source for a route
      const db = await useRawDb(event)
      const { route: r, source } = await readBody(event) as { route: string, source: 'prerender' | 'runtime' }
      await db.exec('UPDATE ai_ready_pages SET source = ? WHERE route = ?', [source, r])
      return { success: true }
    }

    case 'lastmods': {
      // For testing: get all page lastmods (for sitemap enrichment)
      const map = await getPageLastmods(event)
      return { lastmods: Object.fromEntries(map) }
    }

    case 'prepare-sitemap-seed': {
      const db = await useRawDb(event)
      await db.exec(`
        INSERT INTO ai_ready_sitemaps (name, route, last_crawled_at, url_count, error_count, last_error, crawl_state)
        VALUES (?, ?, NULL, 0, 0, NULL, NULL)
        ON CONFLICT(name) DO UPDATE SET
          route = excluded.route,
          last_crawled_at = NULL,
          url_count = 0,
          error_count = 0,
          last_error = NULL,
          crawl_state = NULL
      `, ['sitemap.xml', '/sitemap.xml'])
      return { success: true }
    }

    case 'sitemap-seed-state': {
      const db = await useRawDb(event)
      const row = await db.first<{ last_crawled_at: number | string | null }>(
        'SELECT last_crawled_at FROM ai_ready_sitemaps WHERE name = ?',
        ['sitemap.xml'],
      )
      return { lastCrawledAt: row?.last_crawled_at == null ? null : Number(row.last_crawled_at) }
    }

    default:
      return { error: 'Unknown action' }
  }
})
