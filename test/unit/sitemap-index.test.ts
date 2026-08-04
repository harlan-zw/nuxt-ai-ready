import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSitemapByRoute } from '../../src/runtime/server/utils/sitemap'

vi.mock('#ai-ready-virtual/logger.mjs', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({
    'nuxt-ai-ready': { sitemapPrerendered: false },
    'site': { url: 'https://example.com' },
  }),
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

function toChunkedStream(xml: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(xml)
  let offset = 0

  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

type MockRoute = string | { redirect: string }

function mockEvent(routes: Record<string, MockRoute>): H3Event {
  const localFetch = vi.fn(async (route: string) => {
    const body = routes[route]
    if (body == null)
      return new Response(null, { status: 404, statusText: 'Not Found' })
    if (typeof body !== 'string') {
      return new Response(null, {
        status: 302,
        headers: { location: body.redirect },
      })
    }
    return new Response(toChunkedStream(body), {
      status: 200,
      headers: { 'content-type': 'application/xml' },
    })
  })
  return { fetch: localFetch } as unknown as H3Event
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
    expect(event.fetch).toHaveBeenCalledWith('/sitemap.xml', expect.objectContaining({
      redirect: 'manual',
    }))
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
    expect(event.fetch).toHaveBeenCalledTimes(1)
  })

  it('stops index fanout at the document budget and reports a partial result', async () => {
    const childCount = 101
    const children = Array.from(
      { length: childCount },
      (_, index) => `<sitemap><loc>https://example.com/children/${index}.xml</loc></sitemap>`,
    ).join('')
    const routes = Object.fromEntries([
      ['/sitemap.xml', `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children}</sitemapindex>`],
      ...Array.from(
        { length: childCount },
        (_, index) => [`/children/${index}.xml`, URLSET] as const,
      ),
    ])
    const event = mockEvent(routes)

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(urls.length).toBeGreaterThan(0)
    expect(error).toContain('document_limit')
    expect(event.fetch).toHaveBeenCalledTimes(100)
  })

  it('visits each document once across an A to B cycle', async () => {
    const indexA = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/b.xml</loc></sitemap>
    </sitemapindex>`
    const indexB = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/a.xml</loc></sitemap>
    </sitemapindex>`
    const event = mockEvent({
      '/a.xml': indexA,
      '/b.xml': indexB,
    })

    const { urls, error } = await fetchSitemapByRoute(event, '/a.xml')

    expect(urls).toEqual([])
    expect(error).toBeUndefined()
    expect(event.fetch).toHaveBeenCalledTimes(2)
  })

  it('denies cross-origin index children', async () => {
    const index = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://foreign.example/child.xml</loc></sitemap>
    </sitemapindex>`
    const event = mockEvent({
      '/sitemap.xml': index,
      '/child.xml': URLSET,
    })

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(urls).toEqual([])
    expect(error).toContain('unauthorized')
    expect(event.fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves child query strings when loading local routes', async () => {
    const index = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/child.xml?lang=en&amp;source=index</loc></sitemap>
    </sitemapindex>`
    const event = mockEvent({
      '/sitemap.xml': index,
      '/child.xml?lang=en&source=index': URLSET,
    })

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(error).toBeUndefined()
    expect(urls).toHaveLength(2)
    expect(event.fetch).toHaveBeenCalledWith(
      '/child.xml?lang=en&source=index',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('stops redirects at the redirect budget', async () => {
    const event = mockEvent({
      '/redirect-0.xml': { redirect: '/redirect-1.xml' },
      '/redirect-1.xml': { redirect: '/redirect-2.xml' },
      '/redirect-2.xml': { redirect: '/redirect-3.xml' },
      '/redirect-3.xml': { redirect: '/redirect-4.xml' },
      '/redirect-4.xml': { redirect: '/redirect-5.xml' },
      '/redirect-5.xml': { redirect: '/redirect-6.xml' },
      '/redirect-6.xml': URLSET,
    })

    const { urls, error } = await fetchSitemapByRoute(event, '/redirect-0.xml')

    expect(urls).toEqual([])
    expect(error).toContain('redirect_limit')
    expect(event.fetch).toHaveBeenCalledTimes(6)
  })

  it('returns partial URLs with an error for an incomplete sitemap', async () => {
    const incomplete = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/about</loc></url>`
    const event = mockEvent({ '/sitemap.xml': incomplete })

    const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

    expect(urls).toEqual([{ loc: 'https://example.com/about', lastmod: undefined }])
    expect(error).toBe('Sitemap parse failed: malformed')
  })
})
