import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  useRawDb: vi.fn(),
}))

vi.mock('../../src/runtime/server/db/drizzle/queries', () => ({ initSchema: async () => {} }))
vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({ useRawDb: mocks.useRawDb }))
vi.mock('#nuxtseo/nitro', () => ({
  fetchWithEvent: mocks.fetch,
  useEvent: () => { throw new Error('No active event') },
  useRuntimeConfig: () => ({}),
  useNitroApp: () => ({ hooks: { callHook: vi.fn() } }),
}))
vi.mock('../../src/runtime/server/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn() },
}))

const event = {} as H3Event
const { seedRoutes, queryPages } = await import('../../src/runtime/server/db/queries')
const { batchIndexPages } = await import('../../src/runtime/server/utils/batchIndex')
const { indexPageByRoute } = await import('../../src/runtime/server/utils/indexPage')

describe('indexing removed routes', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    for (const sql of buildSchemaSql())
      sqlite.exec(sql)
    mocks.useRawDb.mockResolvedValue({
      dialect: 'sqlite',
      all: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...params),
      first: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).get(...params),
      exec: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).run(...params),
      batch: async (stmts: { sql: string, params?: unknown[] }[]) => {
        for (const stmt of stmts)
          sqlite.prepare(stmt.sql).run(...(stmt.params || []))
      },
    })
    mocks.fetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    sqlite.close()
  })

  it.each([
    { status: 410 },
    { statusCode: 410 },
    { response: { status: 410 } },
  ])('prunes HTTP 410 without reporting batch errors: %j', async (failure) => {
    mocks.fetch.mockRejectedValue(Object.assign(new Error('Gone'), failure))

    for (let pass = 0; pass < 2; pass++) {
      await seedRoutes(event, ['/gone'])
      expect(await batchIndexPages(event)).toMatchObject({ indexed: 0, remaining: 0, errors: [], complete: true })
      expect(await queryPages(event)).toEqual([])
    }
  })

  it('prunes HTTP 410 when indexing without an event', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(Object.assign(new Error('Gone'), { status: 410 })))
    await seedRoutes(undefined, ['/gone'])
    expect(await indexPageByRoute('/gone', undefined)).toMatchObject({ success: false, gone: true })
    expect(await queryPages(undefined)).toEqual([])
  })

  it.each([404, 500])('keeps HTTP %i as an error until the refresh window', async (status) => {
    mocks.fetch.mockRejectedValue(Object.assign(new Error('Fetch failed'), { status }))
    await seedRoutes(event, ['/failed'])
    expect(await batchIndexPages(event)).toMatchObject({ errors: ['/failed'] })
    await seedRoutes(event, ['/failed'])
    expect(await batchIndexPages(event)).toMatchObject({ errors: [], indexed: 0 })
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(await queryPages(event, { where: { hasError: true } })).toMatchObject([{ route: '/failed', isError: true }])
  })
})
