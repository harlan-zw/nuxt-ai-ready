import type { H3Event } from 'h3'
import type { RuntimeI18nConfig } from '../../src/runtime/server/utils/i18n'
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

const domainI18n: RuntimeI18nConfig = {
  defaultLocale: 'en',
  strategy: 'no_prefix',
  differentDomains: true,
  locales: [
    { code: 'en', hreflang: 'en', domain: 'en.example.com' },
    { code: 'fr', hreflang: 'fr-FR', domain: 'fr.example.com' },
  ],
}

const prefixI18n: RuntimeI18nConfig = {
  defaultLocale: 'en',
  strategy: 'prefix_except_default',
  locales: [
    { code: 'en', hreflang: 'en' },
    { code: 'fr', hreflang: 'fr-FR' },
  ],
}

function eventWithHost(host: string): H3Event {
  return {
    path: '/',
    node: { req: { headers: { host } } },
  } as unknown as H3Event
}

function page(route: string) {
  return {
    route,
    title: `Page ${route}`,
    description: 'Description',
    markdown: `# Page ${route}`,
    headings: '[]',
    keywords: [] as string[],
    updatedAt: new Date().toISOString(),
  }
}

let sqlite: ReturnType<typeof makeSqlite>

async function importQueries() {
  return await import('../../src/runtime/server/db/queries')
}

function localeOf(route: string): string {
  const hit = sqlite.db.prepare('SELECT locale FROM ai_ready_pages WHERE route = ?').get(route) as { locale: string } | undefined
  return hit?.locale ?? ''
}

describe('indexed page locale source', () => {
  beforeEach(() => {
    vi.resetModules()
    sqlite?.db.close()
    sqlite = makeSqlite()
    mocks.runtimeConfig = {}
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue(sqlite.adapter)
  })

  it('derives locale from the site URL host, not the request host', async () => {
    mocks.runtimeConfig = {
      'nuxt-ai-ready': { i18n: domainI18n },
      'site': { url: 'https://en.example.com' },
    }
    const { upsertPage } = await importQueries()

    await upsertPage(eventWithHost('fr.example.com'), page('/about'))

    expect(localeOf('/about')).toBe('en')
  })

  it('derives locale from the route path under prefix strategies', async () => {
    mocks.runtimeConfig = {
      'nuxt-ai-ready': { i18n: prefixI18n },
      'site': { url: 'https://en.example.com' },
    }
    const { upsertPage } = await importQueries()

    await upsertPage(eventWithHost('fr.example.com'), page('/fr/about'))

    expect(localeOf('/fr/about')).toBe('fr')
  })

  it('seeds locale from the site URL host, not the request host', async () => {
    mocks.runtimeConfig = {
      'nuxt-ai-ready': { i18n: domainI18n },
      'site': { url: 'https://fr.example.com' },
    }
    const { seedRoutes } = await importQueries()

    await seedRoutes(eventWithHost('en.example.com'), ['/about'])

    expect(localeOf('/about')).toBe('fr')
  })

  it('falls back to the default locale without a site URL', async () => {
    mocks.runtimeConfig = {
      'nuxt-ai-ready': { i18n: domainI18n },
    }
    const { upsertPage } = await importQueries()

    await upsertPage(eventWithHost('fr.example.com'), page('/about'))

    expect(localeOf('/about')).toBe('en')
  })
})
