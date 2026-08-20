import type { DatabaseAdapter, DumpRow } from '../../src/runtime/server/db/shared'
import { DatabaseSync } from 'node:sqlite'
import { gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { getRawExecutor, registerDriver } from '../../src/runtime/server/db/drizzle/raw'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'
import { exportDbDump, importDbDump } from '../../src/runtime/server/db/shared'

// Wrap a better-sqlite3 instance as a DatabaseAdapter (mirrors how shared.ts
// consumers see the runtime database).
function makeAdapter(db: Database.Database, withBatch = true): DatabaseAdapter {
  return {
    async exec(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params)
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[]
    },
    async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      return db.prepare(sql).get(...params) as T | undefined
    },
    ...(withBatch
      ? {
          async batch(queries: { sql: string, params?: unknown[] }[]) {
            db.transaction(() => {
              for (const q of queries)
                db.prepare(q.sql).run(...(q.params || []))
            })()
          },
        }
      : {}),
  }
}

function schemaDb(): Database.Database {
  const db = new Database(':memory:')
  for (const stmt of buildSchemaSql())
    db.exec(stmt)
  return db
}

// getRawExecutor() needs a DrizzleDatabase-shaped client; registerDriver() keys
// the driver off the same `db` reference, so the raw DB doubles as the key.
type DrizzleClient = Parameters<typeof getRawExecutor>[0]
function fakeClient(db: Database.Database | Record<string, unknown>): DrizzleClient {
  return { dialect: 'sqlite', db: db as unknown as DrizzleClient['db'] } as DrizzleClient
}

function dumpRow(i: number): DumpRow {
  return {
    route: `/page-${i}`,
    route_key: `page-${i}`,
    title: `Page ${i}`,
    description: `Description ${i}`,
    markdown: `# Page ${i}\n\nSome markdown content for page ${i} with searchable words like fox and dog.`,
    headings: `["Page ${i}"]`,
    keywords: '["page","content"]',
    content_hash: `hash-${i}`,
    updated_at: new Date().toISOString(),
    indexed_at: i,
    is_error: 0,
    indexed: 1,
    source: 'prerender',
    last_seen_at: i,
    locale: '',
  }
}

const FTS_MATCH_COUNT = 'SELECT COUNT(*) as count FROM ai_ready_pages_fts WHERE ai_ready_pages_fts MATCH ?'

describe('db: FTS trigger WHEN guard (schema v2.1.1)', () => {
  let db: Database.Database

  afterEach(() => {
    db?.close()
  })

  it('keeps FTS in sync when a searchable column changes', () => {
    db = schemaDb()
    db.prepare(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES ('/a', 'a', 'Title', 'Desc', 'original content with zebra', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)
    `).run()

    // Content change must still reindex (old term gone, new term searchable).
    db.prepare(`UPDATE ai_ready_pages SET markdown = 'brand new content with giraffe' WHERE route = '/a'`).run()
    expect(db.prepare(FTS_MATCH_COUNT).get('zebra')).toEqual({ count: 0 })
    expect(db.prepare(FTS_MATCH_COUNT).get('giraffe')).toEqual({ count: 1 })
  })

  it('keeps FTS intact for bookkeeping-only updates (the guard)', () => {
    db = schemaDb()
    db.prepare(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES ('/a', 'a', 'Title', 'Desc', 'searchable text with zebra', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)
    `).run()

    // Updates that touch only bookkeeping columns must NOT lose FTS entries.
    db.prepare(`UPDATE ai_ready_pages SET indexed = 0 WHERE route = '/a'`).run()
    db.prepare(`UPDATE ai_ready_pages SET indexed_at = 12345 WHERE route = '/a'`).run()
    db.prepare(`UPDATE ai_ready_pages SET last_seen_at = 1, locale = 'en' WHERE route = '/a'`).run()

    expect(db.prepare(FTS_MATCH_COUNT).get('zebra')).toEqual({ count: 1 })
    // And the row is still there in the FTS content table.
    const ftsRow = db.prepare('SELECT rowid FROM ai_ready_pages_fts WHERE ai_ready_pages_fts MATCH ?').get('zebra') as { rowid: number }
    const page = db.prepare('SELECT id FROM ai_ready_pages WHERE route = ?').get('/a') as { id: number }
    expect(ftsRow.rowid).toBe(page.id)
  })

  it('reindexes when a bookkeeping update is followed by a content change', () => {
    db = schemaDb()
    db.prepare(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES ('/a', 'a', 'Title', 'Desc', 'original with zebra', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)
    `).run()
    db.prepare(`UPDATE ai_ready_pages SET indexed = 0 WHERE route = '/a'`).run()
    db.prepare(`UPDATE ai_ready_pages SET markdown = 'changed to giraffe' WHERE route = '/a'`).run()

    expect(db.prepare(FTS_MATCH_COUNT).get('zebra')).toEqual({ count: 0 })
    expect(db.prepare(FTS_MATCH_COUNT).get('giraffe')).toEqual({ count: 1 })
  })

  it('does not lose FTS entries on route/title/description/headings/keywords updates', () => {
    db = schemaDb()
    db.prepare(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES ('/a', 'a', 'old title', 'old desc', 'body zebra', '["old"]', '["k1"]', '2024-01-01', 0, 0, 1, 'prerender', 0)
    `).run()

    // The guarded columns ARE searchable, so the guard fires and reindexes them.
    db.prepare(`UPDATE ai_ready_pages SET title = 'new title' WHERE route = '/a'`).run()
    db.prepare(`UPDATE ai_ready_pages SET description = 'new desc' WHERE route = '/a'`).run()
    db.prepare(`UPDATE ai_ready_pages SET headings = '["new"]' WHERE route = '/a'`).run()
    db.prepare(`UPDATE ai_ready_pages SET keywords = '["k2"]' WHERE route = '/a'`).run()

    expect(db.prepare(FTS_MATCH_COUNT).get('zebra')).toEqual({ count: 1 })
    expect(db.prepare(FTS_MATCH_COUNT).get('new')).toEqual({ count: 1 })
  })
})

describe('db: importDbDump batching (shared.ts)', () => {
  let db: Database.Database

  afterEach(() => {
    db?.close()
  })

  it('imports all rows through multi-row INSERTs with indexed=1', async () => {
    db = schemaDb()
    const adapter = makeAdapter(db)
    const rows = Array.from({ length: 12 }, (_, i) => dumpRow(i + 1))

    await importDbDump(adapter, rows)

    const count = db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get() as { count: number }
    expect(count.count).toBe(12)
    const page = db.prepare('SELECT * FROM ai_ready_pages WHERE route = ?').get('/page-3') as {
      indexed: number
      source: string
      indexed_at: number
      last_seen_at: number
      locale: string
    }
    expect(page.indexed).toBe(1)
    expect(page.source).toBe('prerender')
    expect(page.last_seen_at).toBe(page.indexed_at)
    expect(page.locale).toBe('')
  })

  it('chunks into statements of 7 rows (≤ 100 params) and uses db.batch', async () => {
    db = schemaDb()
    let batchCalls = 0
    const seen: { sql: string, params?: unknown[] }[] = []
    const adapter: DatabaseAdapter = {
      exec: async () => {},
      all: async () => [],
      first: async () => undefined,
      async batch(queries) {
        batchCalls++
        seen.push(...queries)
        for (const q of queries)
          db.prepare(q.sql).run(...(q.params || []))
      },
    }

    await importDbDump(adapter, Array.from({ length: 12 }, (_, i) => dumpRow(i + 1)))

    expect(batchCalls).toBe(1)
    // 12 rows / 7 per statement = 2 statements (7 + 5).
    expect(seen).toHaveLength(2)
    for (const stmt of seen)
      expect(stmt.params!.length).toBeLessThanOrEqual(100)
    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 12 })
  })

  it('falls back to sequential exec when db.batch is absent', async () => {
    db = schemaDb()
    const adapter = makeAdapter(db, false)
    await importDbDump(adapter, [dumpRow(1), dumpRow(2)])
    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 2 })
  })

  it('uses portable upsert SQL for PostgreSQL drivers', async () => {
    db = schemaDb()
    const seen: string[] = []
    const adapter: DatabaseAdapter = {
      exec: async () => {},
      all: async () => [],
      first: async () => undefined,
      batch: async (queries) => {
        seen.push(...queries.map(query => query.sql))
      },
    }

    await importDbDump(adapter, [dumpRow(1)])

    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toContain('INSERT OR REPLACE')
    expect(seen[0]).toContain('ON CONFLICT(route) DO UPDATE SET')
  })

  it('updates existing rows without replacing their primary keys', async () => {
    db = schemaDb()
    const adapter = makeAdapter(db)
    const original = dumpRow(1)
    await importDbDump(adapter, [original])
    const before = db.prepare('SELECT id FROM ai_ready_pages WHERE route = ?').get(original.route) as { id: number }

    await importDbDump(adapter, [{ ...original, title: 'Updated title', markdown: '# Updated' }])

    const after = db.prepare('SELECT id, title, markdown FROM ai_ready_pages WHERE route = ?').get(original.route)
    expect(after).toEqual({ id: before.id, title: 'Updated title', markdown: '# Updated' })
    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 1 })
  })

  it('is a no-op for an empty row list', async () => {
    db = schemaDb()
    await importDbDump(makeAdapter(db), [])
    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 0 })
  })
})

describe('db: exportDbDump keyset pagination (shared.ts)', () => {
  let db: Database.Database

  afterEach(() => {
    db?.close()
  })

  it('uses cursor (route > ?) pagination instead of OFFSET', async () => {
    db = schemaDb()
    const queries: string[] = []
    const adapter: DatabaseAdapter = {
      ...makeAdapter(db),
      async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        queries.push(sql)
        return db.prepare(sql).all(...params) as T[]
      },
    }
    // 1200 rows forces multiple 500-row batches.
    await importDbDump(adapter, Array.from({ length: 1200 }, (_, i) => dumpRow(i + 1)))

    const dump = await exportDbDump(adapter)
    for (const sql of queries)
      expect(sql).not.toContain('OFFSET')
    expect(queries.filter(q => q.includes('route > ?'))).toHaveLength(2)

    const parsed = JSON.parse(gunzipSync(Buffer.from(dump, 'base64')).toString())
    expect(parsed).toHaveLength(1200)
  })

  it('round-trips through importDbDump losslessly', async () => {
    db = schemaDb()
    const adapter = makeAdapter(db)
    await importDbDump(adapter, Array.from({ length: 1100 }, (_, i) => dumpRow(i + 1)))

    const dump = await exportDbDump(adapter)
    const parsed = JSON.parse(gunzipSync(Buffer.from(dump, 'base64')).toString())
    expect(parsed).toHaveLength(1100)

    // Restore into a fresh DB and confirm identical contents.
    const db2 = schemaDb()
    await importDbDump(makeAdapter(db2), parsed as DumpRow[])
    const rows2 = db2.prepare('SELECT route, title, markdown FROM ai_ready_pages ORDER BY route').all()
    expect(rows2).toHaveLength(1100)
    expect(rows2[0]).toEqual({ route: '/page-1', title: 'Page 1', markdown: expect.stringContaining('page 1') })
    const last = rows2[rows2.length - 1] as { route: string }
    expect(last.route).toBe('/page-999') // lexicographic max of /page-N routes
    db2.close()
  })
})

describe('db: raw executor batch (drizzle/raw.ts)', () => {
  it('node:sqlite commits a batch', async () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE proof (value TEXT UNIQUE)')
    const client = fakeClient(db as unknown as Record<string, unknown>)
    registerDriver(client.db, 'node-sqlite', db)

    await getRawExecutor(client).batch([
      { sql: 'INSERT INTO proof (value) VALUES (?)', params: ['one'] },
      { sql: 'INSERT INTO proof (value) VALUES (?)', params: ['two'] },
    ])

    expect(db.prepare('SELECT value FROM proof ORDER BY value').all()).toEqual([
      { value: 'one' },
      { value: 'two' },
    ])
    db.close()
  })

  it('node:sqlite rolls back a failed batch', async () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE proof (value TEXT UNIQUE)')
    const client = fakeClient(db as unknown as Record<string, unknown>)
    registerDriver(client.db, 'node-sqlite', db)

    await expect(getRawExecutor(client).batch([
      { sql: 'INSERT INTO proof (value) VALUES (?)', params: ['same'] },
      { sql: 'INSERT INTO proof (value) VALUES (?)', params: ['same'] },
    ])).rejects.toThrow()

    expect(db.prepare('SELECT COUNT(*) AS count FROM proof').get()).toEqual({ count: 0 })
    db.close()
  })

  it('better-sqlite3: runs statements inside a transaction', async () => {
    const db = schemaDb()
    const client = fakeClient(db)
    registerDriver(client.db, 'better-sqlite3', db)
    const exec = getRawExecutor(client)

    await exec.batch([
      { sql: `INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at) VALUES ('/1', '1', '', '', '', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)` },
      { sql: `INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at) VALUES ('/2', '2', '', '', '', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)` },
    ])

    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 2 })
    db.close()
  })

  it('better-sqlite3: rolls back the whole batch when one statement fails', async () => {
    const db = schemaDb()
    const client = fakeClient(db)
    registerDriver(client.db, 'better-sqlite3', db)
    const exec = getRawExecutor(client)

    await expect(exec.batch([
      { sql: `INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at) VALUES ('/1', '1', '', '', '', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)` },
      { sql: `INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at) VALUES ('/2', '2', '', '', '', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)` },
      // Invalid SQL: duplicate route violates the UNIQUE constraint.
      { sql: `INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at) VALUES ('/1', '1', '', '', '', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0)` },
    ])).rejects.toThrow()

    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 0 })
    db.close()
  })

  it('is a no-op for an empty query list', async () => {
    const db = schemaDb()
    const client = fakeClient(db)
    registerDriver(client.db, 'better-sqlite3', db)
    await getRawExecutor(client).batch([])
    expect(db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get()).toEqual({ count: 0 })
    db.close()
  })

  it('chunks batches at 100 statements for remote drivers (libsql/d1/neon)', async () => {
    const calls: number[] = []
    const driver = {
      prepare: () => ({ bind: () => ({ run: async () => {} }) }),
      batch: async (stmts: unknown[]) => {
        calls.push(stmts.length)
      },
    }
    const db = {} as Record<string, unknown>
    registerDriver(db as unknown as DrizzleClient['db'], 'd1', driver)
    const exec = getRawExecutor(fakeClient(db))

    const queries = Array.from({ length: 250 }, (_, i) => ({
      sql: `UPDATE ai_ready_pages SET indexed = 0 WHERE route = '/r${i}'`,
    }))
    await exec.batch(queries)

    // 250 statements, 100 per batch request.
    expect(calls).toEqual([100, 100, 50])
  })
})
