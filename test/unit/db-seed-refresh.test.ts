import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'

const mocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
  runtimeConfig: {} as Record<string, unknown>,
  useRawDb: vi.fn(),
}))

vi.mock('../../src/runtime/server/db/drizzle/queries', () => ({
  initSchema: mocks.initSchema,
}))

vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({
  useRawDb: mocks.useRawDb,
}))

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: () => {
    throw new Error('No active event')
  },
  useRuntimeConfig: () => mocks.runtimeConfig,
}))

const HOUR = 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 1)
const event = {} as H3Event

describe('seedRoutes refresh window', () => {
  let sqlite: Database.Database
  let rowsWritten: number

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    sqlite = new Database(':memory:')
    for (const stmt of buildSchemaSql())
      sqlite.exec(stmt)
    rowsWritten = 0
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue({
      dialect: 'sqlite',
      all: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...params),
      first: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).get(...params),
      exec: async (sql: string, params: unknown[] = []) => {
        rowsWritten += sqlite.prepare(sql).run(...params).changes
      },
      batch: async (stmts: { sql: string, params?: unknown[] }[]) => {
        for (const stmt of stmts)
          rowsWritten += sqlite.prepare(stmt.sql).run(...(stmt.params || [])).changes
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  function lastSeen(route: string): number {
    return (sqlite.prepare('SELECT last_seen_at FROM ai_ready_pages WHERE route = ?').get(route) as { last_seen_at: number }).last_seen_at
  }

  async function seed(routes: string[], refreshWindowMs?: number) {
    const { seedRoutes } = await import('../../src/runtime/server/db/queries')
    rowsWritten = 0
    const seen = await seedRoutes(event, routes, refreshWindowMs === undefined ? undefined : { refreshWindowMs })
    return { seen, rowsWritten }
  }

  it('writes zero rows when an unchanged route is seeded again inside the window', async () => {
    expect(await seed(['/a', '/b'])).toEqual({ seen: 2, rowsWritten: 2 })

    vi.setSystemTime(T0 + 23 * HOUR)
    expect(await seed(['/a', '/b'])).toEqual({ seen: 2, rowsWritten: 0 })
    expect(lastSeen('/a')).toBe(T0)
  })

  it('gives a seeded, unindexed route no content date', async () => {
    await seed(['/a'])
    const row = sqlite.prepare('SELECT updated_at FROM ai_ready_pages WHERE route = ?').get('/a') as { updated_at: string }
    expect(row.updated_at).toBe('')
  })

  it('refreshes last_seen_at once the row is older than the window', async () => {
    await seed(['/a'])

    vi.setSystemTime(T0 + 25 * HOUR)
    expect(await seed(['/a'])).toEqual({ seen: 1, rowsWritten: 1 })
    expect(lastSeen('/a')).toBe(T0 + 25 * HOUR)
  })

  it('clears an error row inside the window', async () => {
    await seed(['/a'])
    sqlite.prepare('UPDATE ai_ready_pages SET is_error = 1, indexed = 1 WHERE route = ?').run('/a')

    vi.setSystemTime(T0 + HOUR)
    expect(await seed(['/a'])).toEqual({ seen: 1, rowsWritten: 1 })
    expect(sqlite.prepare('SELECT is_error, indexed FROM ai_ready_pages WHERE route = ?').get('/a')).toEqual({ is_error: 0, indexed: 0 })
  })

  it('rewrites a row whose locale changed inside the window', async () => {
    await seed(['/a'])
    sqlite.prepare('UPDATE ai_ready_pages SET locale = ? WHERE route = ?').run('stale-locale', '/a')

    vi.setSystemTime(T0 + HOUR)
    expect(await seed(['/a'])).toEqual({ seen: 1, rowsWritten: 1 })
    expect(sqlite.prepare('SELECT locale FROM ai_ready_pages WHERE route = ?').get('/a')).not.toEqual({ locale: 'stale-locale' })
  })

  it('keeps the window below pruneTtl when pruning is enabled', async () => {
    const { resolveSeedRefreshWindowMs } = await import('../../src/runtime/server/db/queries')
    expect(resolveSeedRefreshWindowMs(0)).toBe(24 * HOUR)
    expect(resolveSeedRefreshWindowMs(30 * 24 * 3600)).toBe(24 * HOUR)
    expect(resolveSeedRefreshWindowMs(3600)).toBe(HOUR / 2)
  })

  it('never prunes a live route whose seed write was skipped', async () => {
    const { pruneStaleRoutes, getStaleRoutes, resolveSeedRefreshWindowMs } = await import('../../src/runtime/server/db/queries')
    const pruneTtl = 3600
    const windowMs = resolveSeedRefreshWindowMs(pruneTtl)

    // Seen at T0, then seen again 29 minutes later: the write is skipped.
    await seed(['/live', '/gone'], windowMs)
    vi.setSystemTime(T0 + 29 * 60 * 1000)
    expect((await seed(['/live'], windowMs)).rowsWritten).toBe(0)

    // A clean crawl that started at that second sighting prunes 32 minutes later.
    const crawlStartedAt = Date.now()
    vi.setSystemTime(T0 + 61 * 60 * 1000)
    expect(await getStaleRoutes(event, pruneTtl, windowMs)).toEqual([])
    expect(await pruneStaleRoutes(event, pruneTtl, crawlStartedAt, windowMs)).toBe(0)
    expect(lastSeen('/live')).toBe(T0)

    // A route nobody has seen for pruneTtl plus the window is still pruned,
    // while the route that keeps appearing in the sitemap stays.
    vi.setSystemTime(T0 + 29 * 60 * 1000 + pruneTtl * 1000)
    expect((await seed(['/live'], windowMs)).rowsWritten).toBe(1)
    vi.setSystemTime(T0 + 29 * 60 * 1000 + pruneTtl * 1000 + windowMs + 1)
    expect(await getStaleRoutes(event, pruneTtl, windowMs)).toEqual(['/gone'])
    expect(await pruneStaleRoutes(event, pruneTtl, undefined, windowMs)).toBe(1)
    const routes = sqlite.prepare('SELECT route FROM ai_ready_pages ORDER BY route').all()
    expect(routes).toEqual([{ route: '/live' }])
  })
})
