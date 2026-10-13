import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useRawDb: vi.fn(), initSchema: vi.fn() }))
vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({ useRawDb: mocks.useRawDb }))
vi.mock('../../src/runtime/server/db/drizzle/queries', () => ({ initSchema: mocks.initSchema }))
vi.mock('../../src/runtime/server/utils/checkStale', () => ({ checkAndHandleStale: async () => {} }))
vi.mock('#nuxtseo/nitro', () => ({ useRuntimeConfig: () => ({}), useEvent: () => undefined }))

let db: Database.Database
const parameterCounts: number[] = []
beforeEach(() => {
  vi.resetModules()
  db = new Database(':memory:')
  db.exec(`CREATE TABLE ai_ready_pages (route TEXT PRIMARY KEY, title TEXT, description TEXT, is_error INTEGER, locale TEXT)`)
  parameterCounts.length = 0
  mocks.initSchema.mockResolvedValue(undefined)
  mocks.useRawDb.mockResolvedValue({
    all: async (sql: string, params: unknown[]) => {
      parameterCounts.push(params.length)
      if (params.length > 100)
        throw new Error('D1 parameter limit')
      return db.prepare(sql).all(...params)
    },
  })
})
afterEach(() => db.close())

const insert = (route: string, isError = 0) => db.prepare('INSERT INTO ai_ready_pages VALUES (?, ?, ?, ?, ?)').run(route, `Title ${route}`, 'Description', isError, 'en')

describe('llms.txt metadata lookup', () => {
  it('reads selected metadata in bounded batches, including error state', async () => {
    const { queryPageMetadata } = await import('../../src/runtime/server/db/queries')
    const routes = Array.from({ length: 205 }, (_, i) => `/page-${i}`)
    for (const route of routes)
      insert(route)
    insert('/retired')
    insert('/error', 1)
    const rows = await queryPageMetadata(undefined, [...routes, '/error', '/missing', routes[0]!])
    expect(rows).toHaveLength(206)
    expect(rows.find(row => row.route === '/page-0')).toEqual({ route: '/page-0', title: 'Title /page-0', description: 'Description', isError: false, locale: 'en' })
    expect(rows.find(row => row.route === '/error')?.isError).toBe(true)
    expect(rows.some(row => row.route === '/retired')).toBe(false)
    expect(parameterCounts).toEqual([100, 100, 7])
  })

  it('returns an empty list without reading storage when no routes are admitted', async () => {
    const { queryPageMetadata } = await import('../../src/runtime/server/db/queries')
    expect(await queryPageMetadata(undefined, [])).toEqual([])
    expect(mocks.useRawDb).not.toHaveBeenCalled()
  })
})
