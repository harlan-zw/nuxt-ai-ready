import type { H3Event } from 'h3'
import type { SitemapCrawlState } from '../../src/runtime/server/utils/sitemap-crawl-state'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNextSitemapToCrawl, getSitemapStatus, markSitemapCrawled, markSitemapCrawlPartial, markSitemapSeeded, syncSitemaps } from '../../src/runtime/server/db/drizzle/queries'

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': {} }),
}))

const continuation: SitemapCrawlState = {
  _tag: 'continuation',
  frontier: [{
    url: 'https://example.com/child.xml',
    depth: 1,
    source: 'index_child',
    parentUrl: 'https://example.com/sitemap.xml',
  }],
  seenDocuments: ['https://example.com/sitemap.xml'],
  documentsAttempted: 100,
  urlsObserved: 50,
  rounds: 1,
  startedAt: 1_700_000_000_000,
}

describe('sitemap continuation database state', () => {
  let sqlite: Database.Database
  let event: H3Event

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE ai_ready_sitemaps (
        name TEXT PRIMARY KEY,
        route TEXT NOT NULL,
        last_crawled_at INTEGER,
        url_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT,
        crawl_state TEXT
      )
    `)
    const db = drizzle({ client: sqlite })
    event = {
      context: {
        _aiReadyDrizzle: { dialect: 'sqlite', db },
      },
    } as unknown as H3Event
  })

  afterEach(() => sqlite.close())

  it('persists and restores a continuation as one atomic value', async () => {
    await syncSitemaps(event, [{ name: 'sitemap.xml', route: '/sitemap.xml' }])

    await markSitemapCrawlPartial(event, 'sitemap.xml', continuation)

    const next = await getNextSitemapToCrawl(event, 60)
    expect(next?.crawlState).toEqual(continuation)
    expect(next?.urlCount).toBe(50)
    expect(await getSitemapStatus(event)).toEqual([
      expect.objectContaining({ name: 'sitemap.xml', continuing: true }),
    ])
  })

  it('clears continuation state after a clean crawl', async () => {
    await syncSitemaps(event, [{ name: 'sitemap.xml', route: '/sitemap.xml' }])
    await markSitemapCrawlPartial(event, 'sitemap.xml', continuation)

    await markSitemapCrawled(event, 'sitemap.xml', 75)

    const row = sqlite.prepare('SELECT crawl_state, url_count FROM ai_ready_sitemaps').get() as {
      crawl_state: string | null
      url_count: number
    }
    expect(row).toEqual({ crawl_state: null, url_count: 75 })
  })

  it('does not let a deferred hook seed clear active continuation state', async () => {
    await syncSitemaps(event, [{ name: 'sitemap.xml', route: '/sitemap.xml' }])
    await markSitemapCrawlPartial(event, 'sitemap.xml', continuation)

    await markSitemapSeeded(event, 'sitemap.xml', 2, null)

    const next = await getNextSitemapToCrawl(event, 60)
    expect(next?.crawlState).toEqual(continuation)
    expect(next?.urlCount).toBe(50)
  })

  it('does not let a deferred hook overwrite a newer clean crawl', async () => {
    await syncSitemaps(event, [{ name: 'sitemap.xml', route: '/sitemap.xml' }])
    await markSitemapCrawled(event, 'sitemap.xml', 75)

    await markSitemapSeeded(event, 'sitemap.xml', 2, null)

    const row = sqlite.prepare('SELECT url_count FROM ai_ready_sitemaps').get() as { url_count: number }
    expect(row.url_count).toBe(75)
  })

  it('clears stale continuation state when a configured route changes', async () => {
    await syncSitemaps(event, [{ name: 'sitemap.xml', route: '/sitemap.xml' }])
    await markSitemapCrawlPartial(event, 'sitemap.xml', continuation)

    await syncSitemaps(event, [{ name: 'sitemap.xml', route: '/new-sitemap.xml' }])

    const next = await getNextSitemapToCrawl(event, -1)
    expect(next).toEqual(expect.objectContaining({
      route: '/new-sitemap.xml',
      crawlState: null,
      urlCount: 0,
    }))
  })
})
