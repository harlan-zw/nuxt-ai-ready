import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { buildSchemaSql } = await import('../../src/runtime/server/db/schema-sql')

function makeSqlite() {
  const db = new Database(':memory:')
  for (const stmt of buildSchemaSql())
    db.exec(stmt)
  return {
    db,
    adapter: {
      async exec(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params)
      },
      async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
        return db.prepare(sql).get(...params) as T | undefined
      },
      async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        return db.prepare(sql).all(...params) as T[]
      },
      async batch(queries: { sql: string, params?: unknown[] }[]) {
        db.transaction(() => {
          for (const q of queries)
            db.prepare(q.sql).run(...(q.params || []))
        })()
      },
    },
  }
}

interface StateRow {
  route: string
  is_error: number
  indexed: number
}

function errorPage(route: string) {
  return {
    route,
    title: '',
    description: '',
    markdown: '',
    headings: '[]',
    keywords: [] as string[],
    updatedAt: new Date().toISOString(),
    isError: true,
  }
}

function successPage(route: string) {
  return {
    route,
    title: `Page ${route}`,
    description: 'Description',
    markdown: `# Page ${route}`,
    headings: '[]',
    keywords: [] as string[],
    updatedAt: new Date().toISOString(),
    isError: false,
  }
}

let sqlite: ReturnType<typeof makeSqlite>

async function importQueries() {
  return await import('../../src/runtime/server/db/queries')
}

function row(route: string): StateRow | undefined {
  return sqlite.db.prepare('SELECT route, is_error, indexed FROM ai_ready_pages WHERE route = ?').get(route) as StateRow | undefined
}

describe('errored page retry (raw layer)', () => {
  beforeEach(() => {
    vi.resetModules()
    sqlite?.db.close()
    sqlite = makeSqlite()
    mocks.runtimeConfig = {}
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue(sqlite.adapter)
  })

  it('marks an errored upsert as not indexed', async () => {
    const { upsertPage } = await importQueries()

    await upsertPage(undefined, errorPage('/flaky'))

    expect(row('/flaky')).toMatchObject({ is_error: 1, indexed: 0 })
  })

  it('recovers a previously errored route on a successful upsert', async () => {
    const { upsertPage } = await importQueries()

    await upsertPage(undefined, errorPage('/flaky'))
    await upsertPage(undefined, successPage('/flaky'))

    expect(row('/flaky')).toMatchObject({ is_error: 0, indexed: 1 })
  })

  it('excludes errored pages from pending selects and counts', async () => {
    const { countPages, queryPages, seedRoutes, upsertPage } = await importQueries()

    await seedRoutes(undefined, ['/ok', '/flaky'])
    await upsertPage(undefined, errorPage('/flaky'))

    const pending = await queryPages(undefined, { where: { pending: true } }) as { route: string }[]
    expect(pending.map(p => p.route)).toEqual(['/ok'])
    expect(await countPages(undefined, { where: { pending: true } })).toBe(1)
  })

  it('retries an errored page after it reappears in a sitemap round', async () => {
    const { queryPages, seedRoutes, upsertPage } = await importQueries()

    await seedRoutes(undefined, ['/flaky'])
    await upsertPage(undefined, errorPage('/flaky'))
    expect(await queryPages(undefined, { where: { pending: true } })).toEqual([])

    await seedRoutes(undefined, ['/flaky'])

    const pending = await queryPages(undefined, { where: { pending: true } }) as { route: string }[]
    expect(pending.map(p => p.route)).toEqual(['/flaky'])
    expect(row('/flaky')).toMatchObject({ is_error: 0, indexed: 0 })
  })

  it('keeps healthy indexed pages indexed across reseeds', async () => {
    const { seedRoutes, upsertPage } = await importQueries()

    await seedRoutes(undefined, ['/stable'])
    await upsertPage(undefined, successPage('/stable'))
    expect(row('/stable')).toMatchObject({ is_error: 0, indexed: 1 })

    await seedRoutes(undefined, ['/stable'])

    expect(row('/stable')).toMatchObject({ is_error: 0, indexed: 1 })
  })
})
