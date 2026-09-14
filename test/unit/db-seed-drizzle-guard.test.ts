import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRawExecutor, registerDriver } from '../../src/runtime/server/db/drizzle/raw'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'

const mocks = vi.hoisted(() => ({
  runtimeConfig: {} as Record<string, unknown>,
  useRawDb: vi.fn(),
}))

vi.mock('../../src/runtime/server/db/drizzle/raw', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/runtime/server/db/drizzle/raw')>()
  return {
    ...original,
    useRawDb: mocks.useRawDb,
  }
})

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: () => {
    throw new Error('No active event')
  },
  useRuntimeConfig: () => mocks.runtimeConfig,
}))

const HOUR = 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 1)
const event = {} as H3Event

describe('seedRoutes refresh window (drizzle layer)', () => {
  let sqlite: Database.Database
  let rowsWritten: number

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    sqlite = new Database(':memory:')
    for (const stmt of buildSchemaSql())
      sqlite.exec(stmt)
    rowsWritten = 0
    mocks.runtimeConfig = {}
    const counting = {
      prepare: (sql: string) => ({
        run: (...params: unknown[]) => {
          rowsWritten += sqlite.prepare(sql).run(...params).changes
        },
      }),
      transaction: (fn: () => void) => fn,
    }
    const dbKey = {} as Record<string, unknown>
    registerDriver(dbKey as unknown as Parameters<typeof registerDriver>[0], 'better-sqlite3', counting)
    const client = { dialect: 'sqlite' as const, db: dbKey }
    mocks.useRawDb.mockReset().mockImplementation(async () => getRawExecutor(client as unknown as Parameters<typeof getRawExecutor>[0]))
  })

  afterEach(() => {
    vi.useRealTimers()
    sqlite.close()
  })

  function lastSeen(route: string): number {
    return (sqlite.prepare('SELECT last_seen_at FROM ai_ready_pages WHERE route = ?').get(route) as { last_seen_at: number }).last_seen_at
  }

  function row(route: string): { is_error: number, indexed: number, locale: string } {
    return sqlite.prepare('SELECT is_error, indexed, locale FROM ai_ready_pages WHERE route = ?').get(route) as { is_error: number, indexed: number, locale: string }
  }

  async function seed(routes: Array<string | { route: string, locale?: string }>, refreshWindowMs?: number) {
    const { seedRoutes } = await import('../../src/runtime/server/db/drizzle/queries')
    rowsWritten = 0
    const seen = await seedRoutes(event, routes, refreshWindowMs === undefined ? undefined : { refreshWindowMs })
    return { seen, rowsWritten }
  }

  it('writes zero rows when unchanged routes are re-seeded an hour later', async () => {
    expect(await seed(['/a', '/b'])).toEqual({ seen: 2, rowsWritten: 2 })

    vi.setSystemTime(T0 + HOUR)
    expect(await seed(['/a', '/b'])).toEqual({ seen: 2, rowsWritten: 0 })
    expect(lastSeen('/a')).toBe(T0)
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
    expect(row('/a')).toEqual({ is_error: 0, indexed: 0, locale: '' })
  })

  it('rewrites a row whose locale changed inside the window', async () => {
    await seed(['/a'])
    sqlite.prepare('UPDATE ai_ready_pages SET locale = ? WHERE route = ?').run('stale-locale', '/a')

    vi.setSystemTime(T0 + HOUR)
    expect(await seed(['/a'])).toEqual({ seen: 1, rowsWritten: 1 })
    expect(row('/a').locale).toBe('')
  })

  it('stores the locale carried by sitemap entries', async () => {
    expect(await seed([{ route: '/fr', locale: 'fr' }])).toEqual({ seen: 1, rowsWritten: 1 })
    expect(row('/fr').locale).toBe('fr')
  })
})
