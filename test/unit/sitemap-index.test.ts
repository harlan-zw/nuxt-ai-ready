import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSitemapByRoute } from '../../src/runtime/server/utils/sitemap'

vi.mock('#ai-ready-virtual/logger.mjs', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': { sitemapPrerendered: false } }),
}))

// No Cloudflare ASSETS binding in this environment
vi.mock('../../src/runtime/server/utils/cloudflare', () => ({
  hasAssets: () => false,
  fetchPublicAsset: async () => null,
}))

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`

const URLSET_FR = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/fr/about</loc></url>
</urlset>`

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/__sitemap__/en.xml</loc></sitemap>
  <sitemap><loc>https://example.com/__sitemap__/fr.xml</loc></sitemap>
</sitemapindex>`

function mockEvent(routes: Record<string, string>): H3Event {
  return {
    $fetch: vi.fn(async (route: string) => {
      const body = routes[route]
      if (body == null)
        throw new Error(`404 ${route}`)
      return body
    }),
  } as unknown as H3Event
}

describe('fetchSitemapByRoute', () => {
  afterEach(() => vi.clearAllMocks())

  it('parses a plain urlset', async () => {
    const event = mockEvent({ '/sitemap.xml': URLSET })

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(error).toBeUndefined()
    expect(urls.map(u => u.loc)).toEqual([
      'https://example.com/about',
      'https://example.com/contact',
    ])
  })

  it('follows a sitemap index and aggregates child urls', async () => {
    const event = mockEvent({
      '/sitemap.xml': INDEX,
      '/__sitemap__/en.xml': URLSET,
      '/__sitemap__/fr.xml': URLSET_FR,
    })

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(error).toBeUndefined()
    expect(urls.map(u => u.loc)).toEqual([
      'https://example.com/about',
      'https://example.com/contact',
      'https://example.com/fr/about',
    ])
  })

  it('returns an error (with partial urls) when a child sitemap fails', async () => {
    // en.xml is served, fr.xml 404s -> we keep en's urls but surface the failure
    // so the cron path does not record a clean crawl and prune on partial data.
    const event = mockEvent({
      '/sitemap.xml': INDEX,
      '/__sitemap__/en.xml': URLSET,
      // fr.xml intentionally missing
    })

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(error).toBeDefined()
    expect(error).toContain('/__sitemap__/fr.xml')
    expect(urls.map(u => u.loc)).toEqual([
      'https://example.com/about',
      'https://example.com/contact',
    ])
  })

  it('does not recurse into itself', async () => {
    // Index whose only child resolves to the same route it was fetched from
    const selfIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap.xml</loc></sitemap>
</sitemapindex>`
    const event = mockEvent({ '/sitemap.xml': selfIndex })

    const { urls } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(urls).toEqual([])
    // fetched once for the index, skipped the self-referencing child
    expect((event.$fetch as any)).toHaveBeenCalledTimes(1)
  })
})
