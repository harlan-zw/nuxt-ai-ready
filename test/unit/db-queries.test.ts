import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Create a minimal DatabaseAdapter interface for testing
interface TestDatabaseAdapter {
  exec: (sql: string, params?: unknown[]) => Promise<void>
  all: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  first: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>
}

function createTestAdapter(db: Database.Database): TestDatabaseAdapter {
  return {
    async exec(sql: string, params?: unknown[]) {
      db.prepare(sql).run(...(params || []))
    },
    async all<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return db.prepare(sql).all(...(params || [])) as T[]
    },
    async first<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
      return db.prepare(sql).get(...(params || [])) as T | undefined
    },
  }
}

// Inline the functions we're testing (to avoid module resolution issues)
function normalizeRouteKey(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, ':') || 'index'
}

async function seedRoutes(db: TestDatabaseAdapter, routes: string[]): Promise<number> {
  const now = new Date().toISOString()
  const nowMs = Date.now()
  for (const route of routes) {
    const routeKey = normalizeRouteKey(route)
    await db.exec(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
      VALUES (?, ?, '', '', '', '[]', '[]', ?, 0, 0, 0, ?)
      ON CONFLICT(route) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `, [route, routeKey, now, nowMs])
  }
  return routes.length
}

async function pruneStaleRoutes(db: TestDatabaseAdapter, staleThresholdSeconds: number): Promise<number> {
  const threshold = Date.now() - (staleThresholdSeconds * 1000)
  const countRow = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM ai_ready_pages WHERE last_seen_at > 0 AND last_seen_at < ?',
    [threshold],
  )
  const count = countRow?.count || 0
  if (count > 0) {
    await db.exec('DELETE FROM ai_ready_pages WHERE last_seen_at > 0 AND last_seen_at < ?', [threshold])
  }
  return count
}

async function getStaleRoutes(db: TestDatabaseAdapter, staleThresholdSeconds: number): Promise<string[]> {
  const threshold = Date.now() - (staleThresholdSeconds * 1000)
  const rows = await db.all<{ route: string }>(
    'SELECT route FROM ai_ready_pages WHERE last_seen_at > 0 AND last_seen_at < ?',
    [threshold],
  )
  return rows.map(r => r.route)
}

// IndexNow query functions
async function getPagesNeedingIndexNowSync(db: TestDatabaseAdapter, limit = 100): Promise<{ route: string }[]> {
  return db.all<{ route: string }>(`
    SELECT route FROM ai_ready_pages
    WHERE indexed = 1
      AND is_error = 0
      AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)
    LIMIT ?
  `, [limit])
}

async function countPagesNeedingIndexNowSync(db: TestDatabaseAdapter): Promise<number> {
  const row = await db.first<{ count: number }>(`
    SELECT COUNT(*) as count FROM ai_ready_pages
    WHERE indexed = 1
      AND is_error = 0
      AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)
  `)
  return row?.count || 0
}

async function markIndexNowSynced(db: TestDatabaseAdapter, routes: string[]): Promise<void> {
  if (routes.length === 0)
    return
  const now = Date.now()
  const placeholders = routes.map(() => '?').join(',')
  await db.exec(
    `UPDATE ai_ready_pages SET indexnow_synced_at = ? WHERE route IN (${placeholders})`,
    [now, ...routes],
  )
}

describe('db-queries: stale route functions', () => {
  let sqliteDb: Database.Database
  let db: TestDatabaseAdapter

  beforeEach(() => {
    sqliteDb = new Database(':memory:')
    db = createTestAdapter(sqliteDb)

    // Create schema
    sqliteDb.exec(`
      CREATE TABLE ai_ready_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route TEXT UNIQUE NOT NULL,
        route_key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        markdown TEXT NOT NULL DEFAULT '',
        headings TEXT NOT NULL DEFAULT '[]',
        keywords TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        is_error INTEGER NOT NULL DEFAULT 0,
        indexed INTEGER NOT NULL DEFAULT 0,
        last_seen_at INTEGER NOT NULL DEFAULT 0,
        indexnow_synced_at INTEGER
      )
    `)
  })

  afterEach(() => {
    sqliteDb.close()
  })

  describe('seedRoutes', () => {
    it('sets last_seen_at on insert', async () => {
      const before = Date.now()
      await seedRoutes(db, ['/about', '/contact'])
      const after = Date.now()

      const rows = await db.all<{ route: string, last_seen_at: number }>('SELECT route, last_seen_at FROM ai_ready_pages')
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(row.last_seen_at).toBeGreaterThanOrEqual(before)
        expect(row.last_seen_at).toBeLessThanOrEqual(after)
      }
    })

    it('updates last_seen_at on conflict', async () => {
      // First insert
      await seedRoutes(db, ['/about'])
      const first = await db.first<{ last_seen_at: number }>('SELECT last_seen_at FROM ai_ready_pages WHERE route = ?', ['/about'])

      // Wait a tiny bit and re-seed
      await new Promise(r => setTimeout(r, 10))
      await seedRoutes(db, ['/about'])
      const second = await db.first<{ last_seen_at: number }>('SELECT last_seen_at FROM ai_ready_pages WHERE route = ?', ['/about'])

      expect(second!.last_seen_at).toBeGreaterThan(first!.last_seen_at)
    })
  })

  describe('getStaleRoutes', () => {
    it('returns empty for fresh routes', async () => {
      await seedRoutes(db, ['/about', '/contact'])
      const stale = await getStaleRoutes(db, 3600) // 1 hour TTL
      expect(stale).toEqual([])
    })

    it('returns routes older than threshold', async () => {
      // Insert a route with old timestamp
      const oldTimestamp = Date.now() - (2 * 24 * 60 * 60 * 1000) // 2 days ago
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/old-page', 'old-page', '', '', '', '[]', '[]', ?, 0, 0, 0, ?)
      `, [new Date().toISOString(), oldTimestamp])

      // Insert a fresh route
      await seedRoutes(db, ['/fresh-page'])

      // With 1 day TTL, old-page should be stale
      const stale = await getStaleRoutes(db, 24 * 60 * 60) // 1 day
      expect(stale).toEqual(['/old-page'])
    })

    it('excludes routes with last_seen_at=0', async () => {
      // Insert a prerendered route (last_seen_at = 0)
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/prerendered', 'prerendered', '', '', '', '[]', '[]', ?, 0, 0, 1, 0)
      `, [new Date().toISOString()])

      // Even with tiny TTL, prerendered should not be stale
      const stale = await getStaleRoutes(db, 1) // 1 second
      expect(stale).toEqual([])
    })
  })

  describe('pruneStaleRoutes', () => {
    it('removes stale routes', async () => {
      // Insert old route
      const oldTimestamp = Date.now() - (2 * 24 * 60 * 60 * 1000)
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/old-page', 'old-page', '', '', '', '[]', '[]', ?, 0, 0, 0, ?)
      `, [new Date().toISOString(), oldTimestamp])

      // Insert fresh route
      await seedRoutes(db, ['/fresh-page'])

      // Prune with 1 day TTL
      const pruned = await pruneStaleRoutes(db, 24 * 60 * 60)
      expect(pruned).toBe(1)

      // Verify old page is gone, fresh page remains
      const remaining = await db.all<{ route: string }>('SELECT route FROM ai_ready_pages')
      expect(remaining.map(r => r.route)).toEqual(['/fresh-page'])
    })

    it('returns 0 when no stale routes', async () => {
      await seedRoutes(db, ['/fresh'])
      const pruned = await pruneStaleRoutes(db, 3600)
      expect(pruned).toBe(0)
    })

    it('never prunes routes with last_seen_at=0', async () => {
      // Insert prerendered route
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/prerendered', 'prerendered', 'Title', '', '# Content', '[]', '[]', ?, 0, 0, 1, 0)
      `, [new Date().toISOString()])

      // Try to prune with tiny TTL
      const pruned = await pruneStaleRoutes(db, 1)
      expect(pruned).toBe(0)

      // Verify still exists
      const row = await db.first<{ route: string }>('SELECT route FROM ai_ready_pages WHERE route = ?', ['/prerendered'])
      expect(row?.route).toBe('/prerendered')
    })
  })

  describe('normalizeRouteKey', () => {
    it('converts / to index', () => {
      expect(normalizeRouteKey('/')).toBe('index')
    })

    it('strips leading slash and converts slashes to colons', () => {
      expect(normalizeRouteKey('/about')).toBe('about')
      expect(normalizeRouteKey('/docs/getting-started')).toBe('docs:getting-started')
      expect(normalizeRouteKey('/a/b/c/d')).toBe('a:b:c:d')
    })
  })

  describe('streamPages', () => {
    // Inline streamPages for testing
    async function* streamPages(
      db: TestDatabaseAdapter,
      options: { batchSize?: number } = {},
    ) {
      const batchSize = options.batchSize || 50
      let offset = 0

      while (true) {
        const rows = await db.all<{ route: string, title: string, description: string, markdown: string, headings: string, keywords: string, updated_at: string }>(
          `SELECT route, title, description, markdown, headings, keywords, updated_at FROM ai_ready_pages WHERE is_error = 0 ORDER BY route LIMIT ? OFFSET ?`,
          [batchSize, offset],
        )

        if (rows.length === 0)
          break

        for (const row of rows) {
          yield {
            route: row.route,
            title: row.title,
            description: row.description,
            markdown: row.markdown,
            headings: row.headings,
            keywords: JSON.parse(row.keywords || '[]'),
            updatedAt: row.updated_at,
          }
        }

        if (rows.length < batchSize)
          break

        offset += batchSize
      }
    }

    it('yields pages in batches', async () => {
      // Insert 5 pages
      for (let i = 1; i <= 5; i++) {
        await db.exec(`
          INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
          VALUES (?, ?, ?, '', '# Content', '[]', '[]', ?, 0, 0, 1, 0)
        `, [`/page-${i}`, `page-${i}`, `Page ${i}`, new Date().toISOString()])
      }

      // Stream with batch size of 2
      const pages = []
      for await (const page of streamPages(db, { batchSize: 2 })) {
        pages.push(page)
      }

      expect(pages).toHaveLength(5)
      expect(pages.map(p => p.route)).toEqual(['/page-1', '/page-2', '/page-3', '/page-4', '/page-5'])
    })

    it('skips error pages', async () => {
      // Insert normal page
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/good', 'good', 'Good', '', '# Content', '[]', '[]', ?, 0, 0, 1, 0)
      `, [new Date().toISOString()])

      // Insert error page
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/error', 'error', '', '', '', '[]', '[]', ?, 0, 1, 0, 0)
      `, [new Date().toISOString()])

      const pages = []
      for await (const page of streamPages(db)) {
        pages.push(page)
      }

      expect(pages).toHaveLength(1)
      expect(pages[0]?.route).toBe('/good')
    })

    it('returns empty when no pages', async () => {
      const pages = []
      for await (const page of streamPages(db)) {
        pages.push(page)
      }
      expect(pages).toHaveLength(0)
    })
  })

  describe('indexNow sync functions', () => {
    it('getPagesNeedingIndexNowSync returns pages not yet synced', async () => {
      const now = Date.now()
      // Insert indexed page without indexnow_synced_at
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/page1', 'page1', 'Page 1', '', '# Content', '[]', '[]', ?, ?, 0, 1, 0)
      `, [new Date().toISOString(), now])

      const pages = await getPagesNeedingIndexNowSync(db)
      expect(pages).toHaveLength(1)
      expect(pages[0]?.route).toBe('/page1')
    })

    it('getPagesNeedingIndexNowSync returns pages with stale indexnow_synced_at', async () => {
      const oldSync = Date.now() - 10000
      const newIndex = Date.now()
      // Insert page that was synced but then re-indexed
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at, indexnow_synced_at)
        VALUES ('/page1', 'page1', 'Page 1', '', '# Content', '[]', '[]', ?, ?, 0, 1, 0, ?)
      `, [new Date().toISOString(), newIndex, oldSync])

      const pages = await getPagesNeedingIndexNowSync(db)
      expect(pages).toHaveLength(1)
    })

    it('getPagesNeedingIndexNowSync excludes synced pages', async () => {
      const now = Date.now()
      // Insert page that is up-to-date
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at, indexnow_synced_at)
        VALUES ('/page1', 'page1', 'Page 1', '', '# Content', '[]', '[]', ?, ?, 0, 1, 0, ?)
      `, [new Date().toISOString(), now, now + 1]) // synced_at > indexed_at

      const pages = await getPagesNeedingIndexNowSync(db)
      expect(pages).toHaveLength(0)
    })

    it('getPagesNeedingIndexNowSync excludes error pages', async () => {
      const now = Date.now()
      // Insert error page
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/error', 'error', '', '', '', '[]', '[]', ?, ?, 1, 1, 0)
      `, [new Date().toISOString(), now])

      const pages = await getPagesNeedingIndexNowSync(db)
      expect(pages).toHaveLength(0)
    })

    it('getPagesNeedingIndexNowSync excludes pending pages', async () => {
      const now = Date.now()
      // Insert unindexed page
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/pending', 'pending', '', '', '', '[]', '[]', ?, ?, 0, 0, 0)
      `, [new Date().toISOString(), now])

      const pages = await getPagesNeedingIndexNowSync(db)
      expect(pages).toHaveLength(0)
    })

    it('countPagesNeedingIndexNowSync returns correct count', async () => {
      const now = Date.now()
      // Insert 3 pages needing sync
      for (let i = 1; i <= 3; i++) {
        await db.exec(`
          INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
          VALUES (?, ?, ?, '', '# Content', '[]', '[]', ?, ?, 0, 1, 0)
        `, [`/page${i}`, `page${i}`, `Page ${i}`, new Date().toISOString(), now])
      }

      const count = await countPagesNeedingIndexNowSync(db)
      expect(count).toBe(3)
    })

    it('markIndexNowSynced updates indexnow_synced_at', async () => {
      const now = Date.now()
      await db.exec(`
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
        VALUES ('/page1', 'page1', 'Page 1', '', '# Content', '[]', '[]', ?, ?, 0, 1, 0)
      `, [new Date().toISOString(), now])

      await markIndexNowSynced(db, ['/page1'])

      const row = await db.first<{ indexnow_synced_at: number }>('SELECT indexnow_synced_at FROM ai_ready_pages WHERE route = ?', ['/page1'])
      expect(row?.indexnow_synced_at).toBeGreaterThanOrEqual(now)
    })

    it('markIndexNowSynced handles multiple routes', async () => {
      const now = Date.now()
      for (let i = 1; i <= 3; i++) {
        await db.exec(`
          INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
          VALUES (?, ?, ?, '', '# Content', '[]', '[]', ?, ?, 0, 1, 0)
        `, [`/page${i}`, `page${i}`, `Page ${i}`, new Date().toISOString(), now])
      }

      await markIndexNowSynced(db, ['/page1', '/page2'])

      // page1 and page2 should be synced
      const count = await countPagesNeedingIndexNowSync(db)
      expect(count).toBe(1) // only page3 needs sync
    })

    it('markIndexNowSynced handles empty array', async () => {
      // Should not throw
      await markIndexNowSynced(db, [])
    })

    it('respects limit in getPagesNeedingIndexNowSync', async () => {
      const now = Date.now()
      for (let i = 1; i <= 10; i++) {
        await db.exec(`
          INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, last_seen_at)
          VALUES (?, ?, ?, '', '# Content', '[]', '[]', ?, ?, 0, 1, 0)
        `, [`/page${i}`, `page${i}`, `Page ${i}`, new Date().toISOString(), now])
      }

      const pages = await getPagesNeedingIndexNowSync(db, 5)
      expect(pages).toHaveLength(5)
    })
  })
})
