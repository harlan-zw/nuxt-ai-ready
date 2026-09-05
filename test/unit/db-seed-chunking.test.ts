import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRawExecutor, registerDriver } from '../../src/runtime/server/db/drizzle/raw'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'
import { maxRowsPerInsert } from '../../src/runtime/server/db/shared'

const mocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
  runtimeConfig: {} as Record<string, unknown>,
  useRawDb: vi.fn(),
}))

vi.mock('../../src/runtime/server/db/drizzle/queries', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/runtime/server/db/drizzle/queries')>()
  return {
    ...original,
    initSchema: mocks.initSchema,
  }
})

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

function schemaDb(): Database.Database {
  const db = new Database(':memory:')
  for (const stmt of buildSchemaSql())
    db.exec(stmt)
  return db
}

function countPages(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) as count FROM ai_ready_pages').get() as { count: number }).count
}

describe('maxRowsPerInsert', () => {
  it.each([
    [4, 25],
    [5, 20],
    [6, 16],
    [7, 14],
    [100, 1],
    [101, 1],
  ])('derives %d rows per statement for %d binds per row', (binds, rows) => {
    expect(maxRowsPerInsert(binds)).toBe(rows)
  })
})

describe('seedRoutes chunking (raw layer)', () => {
  let sqlite: Database.Database
  let paramCounts: number[]

  beforeEach(() => {
    vi.resetModules()
    sqlite?.close()
    sqlite = schemaDb()
    paramCounts = []
    mocks.runtimeConfig = {}
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue({
      dialect: 'sqlite',
      all: async () => [],
      first: async () => undefined,
      exec: async () => {},
      batch: async (stmts: { sql: string, params?: unknown[] }[]) => {
        for (const stmt of stmts) {
          paramCounts.push((stmt.params || []).length)
          sqlite.prepare(stmt.sql).run(...(stmt.params || []))
        }
      },
    })
  })

  it('keeps every statement at or under the 100-bind cap', async () => {
    const routes = Array.from({ length: 42 }, (_, i) => `/page-${i}`)
    const { seedRoutes } = await import('../../src/runtime/server/db/queries')

    const seeded = await seedRoutes({} as H3Event, routes)

    expect(seeded).toBe(42)
    expect(paramCounts).toEqual([100, 100, 10])
    expect(countPages(sqlite)).toBe(42)
  })
})

describe('seedRoutes chunking (drizzle layer)', () => {
  let sqlite: Database.Database
  let paramCounts: number[]

  beforeEach(() => {
    sqlite?.close()
    sqlite = schemaDb()
    paramCounts = []
    mocks.runtimeConfig = {}
    const counting = {
      prepare: (sql: string) => ({
        run: (...params: unknown[]) => {
          paramCounts.push(params.length)
          sqlite.prepare(sql).run(...params)
        },
      }),
      transaction: (fn: () => void) => fn,
    }
    const dbKey = {} as Record<string, unknown>
    registerDriver(dbKey as unknown as Parameters<typeof registerDriver>[0], 'better-sqlite3', counting)
    const client = { dialect: 'sqlite' as const, db: dbKey }
    mocks.useRawDb.mockReset().mockImplementation(async () => getRawExecutor(client as unknown as Parameters<typeof getRawExecutor>[0]))
  })

  it('derives chunk size from the bind count (4 binds -> 25 rows)', async () => {
    const routes = Array.from({ length: 30 }, (_, i) => `/page-${i}`)
    const { seedRoutes } = await import('../../src/runtime/server/db/drizzle/queries')

    const seeded = await seedRoutes({} as H3Event, routes)

    expect(seeded).toBe(30)
    expect(paramCounts).toEqual([100, 20])
    expect(countPages(sqlite)).toBe(30)
  })
})
