import type { H3Event } from 'h3'
import type { DumpRow } from '../../src/runtime/server/db/shared'
import Database from 'better-sqlite3'
import { createApp, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'
import { compressToBase64 } from '../../src/runtime/server/db/shared'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  useRawDb: vi.fn(),
  count: vi.fn(),
  info: new Map<string, string>(),
  assets: {} as Record<string, unknown>,
}))

vi.mock('../../src/runtime/server/db/drizzle/queries', () => ({ initSchema: async () => {} }))
vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({ useRawDb: mocks.useRawDb }))
vi.mock('../../src/runtime/server/db', () => ({
  countPages: mocks.count,
  getInfoValue: async (_event: unknown, key: string) => mocks.info.get(key) ?? null,
  setInfoValue: async (_event: unknown, key: string, value: string) => { mocks.info.set(key, value) },
  getContentHashes: async () => new Map(),
  markRoutesPending: async () => {},
  resetSitemapErrors: async () => 0,
  useRawDb: mocks.useRawDb,
}))
vi.mock('#nuxtseo/nitro', () => ({
  fetchWithEvent: mocks.fetch,
  useEvent: () => { throw new Error('No active event') },
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': { debug: false, runtimeSyncSecret: 'test-secret' } }),
  useNitroApp: () => ({ hooks: { callHook: vi.fn() } }),
}))
vi.mock('../../src/runtime/server/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('../../src/runtime/server/utils/cloudflare', () => ({
  fetchPublicAsset: async (_event: unknown, path: string) => mocks.assets[path] ?? null,
}))

const { seedRoutes, queryPages } = await import('../../src/runtime/server/db/queries')
const { indexPageByRoute } = await import('../../src/runtime/server/utils/indexPage')
const { checkAndHandleStale } = await import('../../src/runtime/server/utils/checkStale')
const { default: restoreEndpoint } = await import('../../src/runtime/server/routes/__ai-ready/restore.post')
const event = {} as H3Event

const dumpRow: DumpRow = {
  route: '/gone',
  route_key: 'gone',
  title: 'Deleted',
  description: '',
  markdown: '# Deleted',
  headings: '[]',
  keywords: '[]',
  content_hash: 'old',
  updated_at: '',
  indexed_at: 1,
  is_error: 0,
  indexed: 1,
  source: 'prerender',
  last_seen_at: null,
  locale: '',
}

describe('stale checks after terminal cleanup', () => {
  let sqlite: Database.Database

  beforeEach(async () => {
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
          sqlite.prepare(stmt.sql).run(...(stmt.params ?? []))
      },
    })
    mocks.count.mockImplementation(async () => (sqlite.prepare('SELECT COUNT(*) AS n FROM ai_ready_pages WHERE is_error = 0').get() as { n: number }).n)
    mocks.fetch.mockRejectedValue(Object.assign(new Error('Gone'), { status: 410 }))
    mocks.info.clear()
    mocks.assets = {}
  })

  afterEach(() => sqlite.close())

  async function publishDump(buildId: string) {
    mocks.assets['/__ai-ready/pages.meta.json'] = { buildId, pageCount: 1, createdAt: '2026-01-01' }
    mocks.assets['/__ai-ready/pages.dump'] = await compressToBase64([dumpRow])
  }

  it('keeps the final HTTP 410 page removed on a same-build check', async () => {
    await seedRoutes(event, ['/gone'])
    mocks.info.set('build_id', 'build-1')
    await publishDump('build-1')
    expect(await indexPageByRoute('/gone', event)).toMatchObject({ gone: true })
    expect(await queryPages(event)).toEqual([])

    const result = await checkAndHandleStale(event)

    expect(await queryPages(event)).toEqual([])
    expect(result.action).toBe('none')
  })

  it.each([null, 'previous-build'])('restores an empty database with build ID %s', async (buildId) => {
    if (buildId)
      mocks.info.set('build_id', buildId)
    await publishDump('build-1')

    const result = await checkAndHandleStale(event)

    expect(result.action).toBe('restored')
    expect(await queryPages(event, { route: '/gone' })).toMatchObject({ route: '/gone', title: 'Deleted' })
  })

  it('allows an explicit restore after same-build cleanup', async () => {
    await seedRoutes(event, ['/gone'])
    mocks.info.set('build_id', 'build-1')
    await publishDump('build-1')
    await indexPageByRoute('/gone', event)
    expect(await queryPages(event)).toEqual([])
    const app = createApp()
    app.use(restoreEndpoint)

    const response = await toWebHandler(app)(new Request('http://localhost/__ai-ready/restore', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ restored: 1 })
    expect(await queryPages(event, { route: '/gone' })).toMatchObject({ route: '/gone', title: 'Deleted' })
  })
})
