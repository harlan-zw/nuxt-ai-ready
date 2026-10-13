import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
}))
// Normalized @nuxtjs/sitemap 9 config for sitemap: { sitemaps: true }.
vi.mock('#ai-ready-virtual/sitemap-config.mjs', () => ({ default: {
  isMultiSitemap: true,
  sitemaps: {
    index: { sitemapName: 'index', _route: '/registry/sitemap_index.xml' },
    chunks: { sitemapName: 'chunks', includeAppSources: true },
  },
} }))
vi.mock('#nuxtseo/nitro', () => ({
  fetchRawWithEvent: (event: H3Event, request: RequestInfo | URL, init?: RequestInit) => event.fetch(request, init),
  useRuntimeConfig: () => ({
    'app': { baseURL: '/registry/' },
    'site': { url: 'https://example.com' },
    'nuxt-ai-ready': { database: { _tag: 'Disabled' }, llmsTxt: mocks.config },
  }),
}))
vi.mock('#site-config/server/composables/getSiteConfig', () => ({ getSiteConfig: () => ({ name: 'Example', url: 'https://example.com' }) }))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
  withSiteTrailingSlash: (_event: unknown, path: string) => path,
}))
vi.mock('../../src/runtime/server/utils/cloudflare', () => ({ hasAssets: () => false }))
vi.mock('#ai-ready-virtual/logger.mjs', () => ({ logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() } }))

const { buildLlmsTxtFiles } = await import('../../src/runtime/llms-txt-utils')
const { fetchSitemapUrlGroups } = await import('../../src/runtime/server/utils/sitemap')

function event(): H3Event {
  const routes: Record<string, string> = {
    '/registry/sitemap_index.xml': '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/registry/__sitemap__/0.xml</loc></sitemap><sitemap><loc>https://example.com/registry/__sitemap__/1.xml</loc></sitemap></sitemapindex>',
    '/registry/__sitemap__/0.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/registry/about</loc></url></urlset>',
    '/registry/__sitemap__/1.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/registry/contact</loc></url></urlset>',
  }
  return {
    req: new Request('https://example.com/registry/llms.txt'),
    url: new URL('https://example.com/registry/llms.txt'),
    path: '/registry/llms.txt',
    context: {},
    fetch: vi.fn(async (route: string) => new Response(routes[route] || null, { status: routes[route] ? 200 : 404 })),
  } as unknown as H3Event
}

beforeEach(() => {
  mocks.config = { pages: 'sitemap', markdownLinks: true, sections: [{ title: 'LLM Resources', links: [] }] }
})

describe('automatic chunk sitemap discovery', () => {
  it.each([undefined, ['chunks']])('reads every chunk with selection %s and applies the base once', async (names) => {
    const request = event()
    const groups = await fetchSitemapUrlGroups(request, names)
    expect(groups.get('chunks')?.map(url => url.loc)).toEqual([
      'https://example.com/registry/about',
      'https://example.com/registry/contact',
    ])
    expect(request.fetch).toHaveBeenCalledWith('/registry/sitemap_index.xml', expect.anything())
  })

  it('admits automatic pages and links the actual sitemap index resource', async () => {
    const text = (await buildLlmsTxtFiles(event()))['/llms.txt']!
    expect(text).toContain('https://example.com/registry/about.md)')
    expect(text).toContain('https://example.com/registry/contact.md)')
    expect(text).toContain('[sitemap_index.xml](https://example.com/registry/sitemap_index.xml)')
    expect(text).not.toContain('chunks.xml')
  })

  it('writes a section selected from the automatic chunks group', async () => {
    mocks.config.sitemaps = ['chunks']
    mocks.config.sections = [{ title: 'Pages', sitemap: 'chunks' }]
    const files = await buildLlmsTxtFiles(event())
    expect(files['/llms.txt']).toContain('https://example.com/registry/llms/chunks.txt)')
    expect(files['/llms/chunks.txt']).toContain('https://example.com/registry/about.md)')
    expect(files['/llms/chunks.txt']).toContain('https://example.com/registry/contact.md)')
  })
})
