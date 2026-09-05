import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDriver } from '../../src/runtime/server/db/drizzle/raw'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': {} }),
}))

const { countPages, getPendingPages, markRoutesPending, seedRoutes, upsertPage }
  = await import('../../src/runtime/server/db/drizzle/queries')

interface StateRow {
  route: string
  is_error: number
  indexed: number
}

function insertPage(db: Database.Database, route: string, isError: number, indexed: number) {
  db.prepare(`
    INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source)
    VALUES (?, ?, '', '', '', '[]', '[]', '2024-01-01', 0, ?, ?, 'prerender')
  `).run(route, route.slice(1), isError, indexed)
}

function page(route: string, isError: boolean) {
  return {
    route,
    title: `Page ${route}`,
    description: 'Description',
    markdown: `# Page ${route}`,
    headings: '[]',
    keywords: [] as string[],
    updatedAt: new Date().toISOString(),
    isError,
  }
}

describe('errored page retry (drizzle layer)', () => {
  let sqlite: Database.Database
  let event: H3Event

  beforeEach(() => {
    sqlite = new Database(':memory:')
    for (const stmt of buildSchemaSql())
      sqlite.exec(stmt)
    const db = drizzle({ client: sqlite })
    registerDriver(db, 'better-sqlite3', sqlite)
    event = {
      context: {
        _aiReadyDrizzle: { dialect: 'sqlite', db },
      },
    } as unknown as H3Event
  })

  afterEach(() => sqlite.close())

  function row(route: string): StateRow | undefined {
    return sqlite.prepare('SELECT route, is_error, indexed FROM ai_ready_pages WHERE route = ?').get(route) as StateRow | undefined
  }

  it('marks an errored upsert as not indexed', async () => {
    await upsertPage(event, page('/flaky', true))

    expect(row('/flaky')).toMatchObject({ is_error: 1, indexed: 0 })
  })

  it('recovers a previously errored route on a successful upsert', async () => {
    await upsertPage(event, page('/flaky', true))
    await upsertPage(event, page('/flaky', false))

    expect(row('/flaky')).toMatchObject({ is_error: 0, indexed: 1 })
  })

  it('clears is_error when marking routes pending', async () => {
    insertPage(sqlite, '/changed', 1, 1)

    await markRoutesPending(event, ['/changed'])

    expect(row('/changed')).toMatchObject({ is_error: 0, indexed: 0 })
  })

  it('retries an errored page after it reappears in a sitemap round', async () => {
    insertPage(sqlite, '/flaky', 1, 0)
    insertPage(sqlite, '/stable', 0, 1)

    await seedRoutes(event, ['/flaky', '/stable'])

    expect(row('/flaky')).toMatchObject({ is_error: 0, indexed: 0 })
    expect(row('/stable')).toMatchObject({ is_error: 0, indexed: 1 })
  })

  it('excludes errored pages from pending selects and counts', async () => {
    insertPage(sqlite, '/err', 1, 0)
    insertPage(sqlite, '/pend', 0, 0)

    expect(await getPendingPages(event, 10)).toEqual([{ route: '/pend' }])
    expect(await countPages(event, { indexed: false })).toBe(1)
  })
})
