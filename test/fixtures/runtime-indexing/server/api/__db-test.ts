import { countPages, getPageLastmods, getStaleRoutes, pruneStaleRoutes, queryPages, searchPages, upsertPage, useRawDb } from '#ai-ready'
import { initSchema } from '#ai-ready/server/db'
import { defineEventHandler, getQuery, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { action, ...params } = getQuery(event) as { action: string, [k: string]: unknown }

  switch (action) {
    case 'migrate-legacy-postgres-schema': {
      const db = await useRawDb(event)
      await db.exec('DROP TABLE IF EXISTS ai_ready_pages CASCADE')
      await db.exec('DROP TABLE IF EXISTS _ai_ready_info CASCADE')
      await db.exec(`
        CREATE TABLE ai_ready_pages (
          id SERIAL PRIMARY KEY,
          route TEXT UNIQUE NOT NULL,
          route_key TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          markdown TEXT NOT NULL DEFAULT '',
          headings TEXT NOT NULL DEFAULT '[]',
          keywords TEXT NOT NULL DEFAULT '[]',
          content_hash TEXT,
          updated_at TEXT NOT NULL,
          indexed_at INTEGER NOT NULL,
          is_error INTEGER NOT NULL DEFAULT 0,
          indexed INTEGER NOT NULL DEFAULT 0,
          source TEXT NOT NULL DEFAULT 'prerender',
          last_seen_at INTEGER,
          locale TEXT NOT NULL DEFAULT ''
        )
      `)
      await db.exec(`
        CREATE TABLE _ai_ready_info (
          id TEXT PRIMARY KEY,
          value TEXT,
          version TEXT,
          checksum TEXT,
          ready INTEGER DEFAULT 0
        )
      `)
      await db.exec("INSERT INTO _ai_ready_info (id, version) VALUES ('schema', 'v2.3.0-drizzle')")

      await initSchema(event)

      const indexedAt = Date.now()
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, updated_at, indexed_at)
        VALUES (?, ?, ?, ?)
      `, ['/legacy-postgres', 'legacy-postgres', new Date(indexedAt).toISOString(), indexedAt])
      const column = await db.first<{ data_type: string }>(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'ai_ready_pages' AND column_name = 'indexed_at'
      `)
      const row = await db.first<{ indexed_at: number | string }>(
        'SELECT indexed_at FROM ai_ready_pages WHERE route = ?',
        ['/legacy-postgres'],
      )
      return { dataType: column?.data_type, indexedAt: Number(row?.indexed_at) }
    }

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
