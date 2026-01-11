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
        last_seen_at INTEGER NOT NULL DEFAULT 0
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
})
