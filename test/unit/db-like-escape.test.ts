import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { escapeLikeTerm, LIKE_ESCAPE, likeSubstring } from '../../src/runtime/server/db/shared'

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

describe('escapeLikeTerm', () => {
  it.each([
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['plain term', 'plain term'],
    ['%_', '\\%\\_'],
  ])('escapes %s into %s', (input, expected) => {
    expect(escapeLikeTerm(input)).toBe(expected)
    expect(likeSubstring(input)).toBe(`%${expected}%`)
  })

  it('exposes the escape character value', () => {
    expect(LIKE_ESCAPE).toBe('\\')
  })
})

describe('searchPages postgres ILIKE escaping (raw layer)', () => {
  let sqlite: Database.Database
  let captured: { sql: string, params: unknown[] } | undefined

  beforeEach(() => {
    vi.resetModules()
    sqlite?.close()
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE ai_ready_pages (
        route TEXT,
        title TEXT,
        description TEXT DEFAULT '',
        markdown TEXT DEFAULT '',
        headings TEXT DEFAULT '[]',
        is_error INTEGER DEFAULT 0
      )
    `)
    captured = undefined
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue({
      dialect: 'postgres',
      all: async (sql: string, params: unknown[]) => {
        captured = { sql, params }
        return []
      },
      first: async () => undefined,
      exec: async () => {},
      batch: async () => {},
    })
  })

  async function searchRaw(term: string): Promise<{ sql: string, params: unknown[] }> {
    const { searchPages } = await import('../../src/runtime/server/db/queries')
    await searchPages({} as H3Event, term)
    return captured!
  }

  it('escapes wildcards and binds an escape character per ILIKE', async () => {
    const { sql, params } = await searchRaw('100%')

    expect(sql.match(/ESCAPE \?/g)).toHaveLength(4)
    expect(params[0]).toBe('%100\\%%')
    expect(params.filter(p => p === LIKE_ESCAPE)).toHaveLength(4)
    expect(params[params.length - 1]).toBe(10)
  })

  it.each([
    ['%', ['/pct']],
    ['_', ['/us']],
    ['100%', ['/pct']],
    ['back\\slash', ['/back']],
    ['sure', ['/pct']],
  ])('term %r does not over-match (matches %s)', async (term, expectedRoutes) => {
    for (const [route, title] of [
      ['/pct', '100% sure'],
      ['/us', 'snake_case'],
      ['/plain', 'plain title'],
      ['/back', 'back\\slash'],
    ] as const) {
      sqlite.prepare('INSERT INTO ai_ready_pages (route, title) VALUES (?, ?)').run(route, title)
    }

    const { sql, params } = await searchRaw(term)
    const rows = sqlite.prepare(sql.replace(/ILIKE/g, 'LIKE')).all(...params) as Array<{ route: string }>

    expect(rows.map(r => r.route)).toEqual(expectedRoutes)
  })
})

describe('searchPages LIKE fallback escaping (drizzle layer)', () => {
  it('a wildcard-only query matches only rows containing that literal character', async () => {
    const sqlite = new Database(':memory:')
    for (const stmt of buildSchemaSql())
      sqlite.exec(stmt)
    const insert = sqlite.prepare(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at, locale)
      VALUES (?, ?, ?, '', '', '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0, '')
    `)
    insert.run('/pct', 'pct', '100% sure')
    insert.run('/us', 'us', 'snake_case')
    insert.run('/plain', 'plain', 'plain title')

    const event = {
      context: {
        _aiReadyDrizzle: { dialect: 'sqlite', db: drizzle({ client: sqlite }) },
      },
    } as unknown as H3Event

    const { searchPages } = await import('../../src/runtime/server/db/drizzle/queries')
    const pct = await searchPages(event, '%')
    expect(pct.map(r => r.route)).toEqual(['/pct'])

    const us = await searchPages(event, '_')
    expect(us.map(r => r.route)).toEqual(['/us'])

    sqlite.close()
  })
})
