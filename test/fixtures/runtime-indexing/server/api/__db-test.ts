import { countPages, getPageLastmods, getStaleRoutes, pruneStaleRoutes, queryPages, searchPages, upsertPage, useRawDb } from '#ai-ready'
import { initSchema } from '#ai-ready/server/db'
import { defineEventHandler, getQuery, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const { action, ...params } = getQuery(event) as { action: string, [k: string]: unknown }

  switch (action) {
    case 'initialize-fresh-postgres-schema': {
      const db = await useRawDb(event)
      await db.exec('DROP TABLE IF EXISTS ai_ready_pages CASCADE')
      await db.exec('DROP TABLE IF EXISTS _ai_ready_info CASCADE')
      await db.exec('DROP TABLE IF EXISTS ai_ready_cron_runs CASCADE')
      await db.exec('DROP TABLE IF EXISTS ai_ready_indexnow_log CASCADE')
      await db.exec('DROP TABLE IF EXISTS ai_ready_sitemaps CASCADE')

      await initSchema(event)

      const schema = await db.first<{ version: string }>(
        "SELECT version FROM _ai_ready_info WHERE id = 'schema'",
      )
      const tables = await db.all<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            '_ai_ready_info',
            'ai_ready_cron_runs',
            'ai_ready_pages',
            'ai_ready_sitemaps'
          )
        ORDER BY table_name
      `)

      return {
        schemaVersion: schema?.version,
        tables: tables.map(table => table.table_name),
      }
    }

    case 'migrate-legacy-postgres-schema': {
      const db = await useRawDb(event)
      await db.exec('DROP TABLE IF EXISTS ai_ready_pages CASCADE')
      await db.exec('DROP TABLE IF EXISTS _ai_ready_info CASCADE')
      await db.exec('DROP TABLE IF EXISTS ai_ready_cron_runs CASCADE')
      await db.exec('DROP TABLE IF EXISTS ai_ready_sitemaps CASCADE')
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
      await db.exec(`
        CREATE TABLE ai_ready_cron_runs (
          id SERIAL PRIMARY KEY,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          duration_ms INTEGER,
          pages_indexed INTEGER DEFAULT 0,
          pages_remaining INTEGER DEFAULT 0,
          errors TEXT DEFAULT '[]',
          status TEXT DEFAULT 'running'
        )
      `)
      await db.exec(`
        CREATE TABLE ai_ready_sitemaps (
          name TEXT PRIMARY KEY,
          route TEXT NOT NULL,
          last_crawled_at INTEGER,
          url_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          last_error TEXT,
          crawl_state TEXT
        )
      `)

      const legacyTimestamp = 1_700_000_000
      await db.exec("INSERT INTO _ai_ready_info (id, version) VALUES ('schema', 'v2.3.0-drizzle')")
      await db.exec("INSERT INTO _ai_ready_info (id, value) VALUES ('legacy_metadata', 'preserved')")
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, updated_at, indexed_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
      `, ['/legacy-postgres', 'legacy-postgres', new Date(legacyTimestamp).toISOString(), legacyTimestamp, legacyTimestamp])
      await db.exec(`
        INSERT INTO ai_ready_cron_runs (started_at, finished_at, status)
        VALUES (?, ?, 'success')
      `, [legacyTimestamp, legacyTimestamp])
      await db.exec(`
        INSERT INTO ai_ready_sitemaps (name, route, last_crawled_at, crawl_state)
        VALUES ('sitemap.xml', '/sitemap.xml', ?, 'complete')
      `, [legacyTimestamp])

      await initSchema(event)

      const persistedAt = Date.now()
      await db.exec('UPDATE ai_ready_pages SET indexed_at = ?, last_seen_at = ? WHERE route = ?', [persistedAt, persistedAt, '/legacy-postgres'])
      await db.exec('UPDATE ai_ready_cron_runs SET started_at = ?, finished_at = ?', [persistedAt, persistedAt])
      await db.exec("UPDATE ai_ready_sitemaps SET last_crawled_at = ? WHERE name = 'sitemap.xml'", [persistedAt])

      const columns = await db.all<{ data_type: string, table_name: string, column_name: string }>(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE (table_name, column_name) IN (
          ('ai_ready_pages', 'indexed_at'),
          ('ai_ready_pages', 'last_seen_at'),
          ('ai_ready_cron_runs', 'started_at'),
          ('ai_ready_cron_runs', 'finished_at'),
          ('ai_ready_sitemaps', 'last_crawled_at')
        )
      `)
      const page = await db.first<{ route: string, indexed_at: number | string, last_seen_at: number | string }>(
        'SELECT route, indexed_at, last_seen_at FROM ai_ready_pages WHERE route = ?',
        ['/legacy-postgres'],
      )
      const cron = await db.first<{ status: string, started_at: number | string, finished_at: number | string }>(
        'SELECT status, started_at, finished_at FROM ai_ready_cron_runs',
      )
      const sitemap = await db.first<{ name: string, crawl_state: string, last_crawled_at: number | string }>(
        "SELECT name, crawl_state, last_crawled_at FROM ai_ready_sitemaps WHERE name = 'sitemap.xml'",
      )
      const metadata = await db.first<{ value: string }>(
        "SELECT value FROM _ai_ready_info WHERE id = 'legacy_metadata'",
      )

      return {
        columnTypes: Object.fromEntries(columns.map(column => [`${column.table_name}.${column.column_name}`, column.data_type])),
        preserved: {
          pageRoute: page?.route,
          cronStatus: cron?.status,
          sitemapName: sitemap?.name,
          sitemapState: sitemap?.crawl_state,
          metadataValue: metadata?.value,
        },
        persistedAt,
        storedTimestamps: [
          page?.indexed_at,
          page?.last_seen_at,
          cron?.started_at,
          cron?.finished_at,
          sitemap?.last_crawled_at,
        ].map(Number),
      }
    }

    case 'count':
      return { count: await countPages(event) }

    case 'list':
      return { pages: await queryPages(event) }

    case 'get':
      return { page: await queryPages(event, { route: params.route as string, includeMarkdown: true }) }

    case 'search':
      return { results: await searchPages(event, params.q as string, { limit: Number(params.limit) || 10 }) }

    case 'upsert': {
      const body = await readBody(event)
      await upsertPage(event, body)
      return { success: true }
    }

    case 'prepare-indexing-route': {
      const db = await useRawDb(event)
      const { route: pendingRoute } = await readBody(event) as { route: string }
      await upsertPage(event, {
        route: pendingRoute,
        title: 'Pending',
        description: '',
        markdown: 'Pending',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
      })
      await db.exec('UPDATE ai_ready_pages SET indexed = 1')
      await db.exec('UPDATE ai_ready_pages SET indexed = 0 WHERE route = ?', [pendingRoute])
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
