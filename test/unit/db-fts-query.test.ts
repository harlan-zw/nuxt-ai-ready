import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
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
  useRuntimeConfig: () => ({}),
}))

const { buildSchemaSql } = await import('../../src/runtime/server/db/schema-sql')

const PAGES = [
  ['/docs/og-image/fonts', 'Custom Fonts', 'Load custom fonts for og-image rendering and defineOgImage calls.'],
  ['/docs/schema-org', 'Schema.org', 'Add schema-org JSON-LD. Do not forget the identity.'],
  ['/docs/nuxt-seo/v6', 'What\'s new in v6', 'The nuxt-seo v6 release notes.'],
  ['/docs/sitemap', 'Sitemap', 'Configure the sitemap-index next to "robots" rules. Test your setup.'],
] as const

function seed(tokenizer?: 'trigram'): Database.Database {
  const sqlite = new Database(':memory:')
  for (const stmt of buildSchemaSql(tokenizer ? { ftsTokenizer: tokenizer } : undefined))
    sqlite.exec(stmt)
  const insert = sqlite.prepare(`
    INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at, locale)
    VALUES (?, ?, ?, '', ?, '[]', '[]', '2024-01-01', 0, 0, 1, 'prerender', 0, '')
  `)
  for (const [route, title, markdown] of PAGES)
    insert.run(route, route, title, markdown)
  return sqlite
}

// Queries an agent sends verbatim. Each used to reach FTS5 MATCH unescaped and
// throw: hyphens read as column filters, `'` and `.` as syntax errors.
const MATCHING_QUERIES = [
  ['og-image fonts', '/docs/og-image/fonts'],
  ['fonts og-image', '/docs/og-image/fonts'],
  ['schema-org', '/docs/schema-org'],
  ['nuxt-seo v6', '/docs/nuxt-seo/v6'],
  ['what\'s new in v6', '/docs/nuxt-seo/v6'],
  ['sitemap-*', '/docs/sitemap'],
  ['schema.org NOT', '/docs/schema-org'],
  ['defineOgImage AND fonts', '/docs/og-image/fonts'],
  ['"robots"', '/docs/sitemap'],
  ['(test', '/docs/sitemap'],
] as const

describe('searchPages FTS5 query escaping (raw layer)', () => {
  let sqlite: Database.Database

  async function search(query: string) {
    mocks.useRawDb.mockResolvedValue({
      dialect: 'sqlite',
      all: async (sql: string, params: unknown[]) => sqlite.prepare(sql).all(...params),
      first: async () => undefined,
      exec: async () => {},
      batch: async () => {},
    })
    const { searchPages } = await import('../../src/runtime/server/db/queries')
    return searchPages({} as H3Event, query)
  }

  beforeEach(() => {
    vi.resetModules()
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    sqlite = seed()
  })

  afterEach(() => sqlite.close())

  it.each(MATCHING_QUERIES)('%s finds %s', async (query, route) => {
    const rows = await search(query)
    expect(rows.map(r => r.route)).toContain(route)
  })

  it('keeps prefix matching for partial words', async () => {
    const rows = await search('sitem')
    expect(rows.map(r => r.route)).toEqual(['/docs/sitemap'])
  })

  it.each(['*', '""', '  ', '- . \''])('returns no rows for %j, which has no searchable term', async (query) => {
    await expect(search(query)).resolves.toEqual([])
  })

  it('does not throw under the trigram tokenizer', async () => {
    sqlite.close()
    sqlite = seed('trigram')
    const rows = await search('og-image fonts')
    expect(rows.map(r => r.route)).toContain('/docs/og-image/fonts')
  })
})

describe('searchPages FTS5 query escaping (drizzle layer)', () => {
  let sqlite: Database.Database

  async function search(query: string) {
    const event = {
      context: {
        _aiReadyDrizzle: { dialect: 'sqlite', db: drizzle({ client: sqlite }) },
      },
    } as unknown as H3Event
    const { searchPages } = await import('../../src/runtime/server/db/drizzle/queries')
    return searchPages(event, query)
  }

  beforeEach(() => {
    sqlite = seed()
  })

  afterEach(() => sqlite.close())

  // `fonts og-image` never appears as one substring, so only the FTS path can
  // find it. A throwing MATCH used to fall back to LIKE and return nothing.
  it.each(MATCHING_QUERIES)('%s finds %s', async (query, route) => {
    const rows = await search(query)
    expect(rows.map(r => r.route)).toContain(route)
  })
})
