import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  config: { pages: 'sitemap', markdownLinks: true, sections: [], sitemaps: ['pages'] } as Record<string, unknown>,
  groups: vi.fn(),
  metadata: vi.fn(),
  allPages: vi.fn(),
  warn: vi.fn(),
}))
vi.mock('#nuxtseo/nitro', () => ({ useRuntimeConfig: () => ({ 'app': { baseURL: '/' }, 'nuxt-ai-ready': { llmsTxt: mocks.config } }) }))
vi.mock('#site-config/server/composables/getSiteConfig', () => ({ getSiteConfig: () => ({ name: 'Example', url: 'https://example.com' }) }))
vi.mock('#site-config/server/composables/utils', () => ({
  withSiteUrl: (_event: unknown, path: string) => `https://example.com${path}`,
  withSiteTrailingSlash: (_event: unknown, path: string) => path,
}))
vi.mock('../../src/runtime/server/utils/sitemap', () => ({ fetchSitemapUrlGroups: mocks.groups, getSitemapsFromConfig: () => [] }))
vi.mock('../../src/runtime/server/db/queries', () => ({ queryPageMetadata: mocks.metadata, queryPages: mocks.allPages }))
vi.mock('../../src/runtime/server/logger', () => ({ logger: { warn: mocks.warn } }))

const { buildLlmsTxtFiles } = await import('../../src/runtime/llms-txt-utils')
const event = () => ({ req: new Request('https://example.com/llms.txt'), url: new URL('https://example.com/llms.txt'), path: '/llms.txt', context: {} }) as unknown as H3Event
const page = (route: string, isError = false) => ({ route, title: `Title ${route}`, description: 'Description', isError, locale: '' })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.config.pages = 'sitemap'
  mocks.groups.mockResolvedValue(new Map([['pages', [
    { loc: 'https://example.com/about/' },
    { loc: 'https://example.com/about' },
    { loc: 'https://example.com/about?page=2' },
    { loc: 'https://example.com/about#detail' },
    { loc: 'https://other.example.com/foreign' },
    { loc: 'https://example.com/broken' },
  ]]]))
  mocks.metadata.mockResolvedValue([page('/about'), page('/retired'), page('/broken', true)])
  mocks.allPages.mockImplementation((_event, options) => Promise.resolve(options?.where?.hasError ? [page('/broken', true)] : [page('/about'), page('/retired')]))
})

describe('llms.txt admission', () => {
  it('uses sitemap admission and stored metadata without stale, foreign, query, or error URLs', async () => {
    const files = await buildLlmsTxtFiles(event())
    const text = files['/llms.txt']!
    expect(text).toContain('[Title /about](https://example.com/about.md): Description')
    for (const omitted of ['/retired', '/foreign', '/broken', '?page', '#detail'])
      expect(text).not.toContain(omitted)
    expect(text.split('](https://example.com/about.md)')).toHaveLength(2)
    expect(mocks.groups).toHaveBeenCalledWith(expect.anything(), ['pages'])
    expect(mocks.metadata).toHaveBeenCalledWith(expect.anything(), ['/about', '/about', '/broken', '/broken'])
    expect(mocks.allPages).not.toHaveBeenCalled()
  })

  it('supports explicit inclusion of stored pages outside the sitemap', async () => {
    mocks.config.pages = 'all'
    expect((await buildLlmsTxtFiles(event()))['/llms.txt']).toContain('/retired.md')
  })

  it('serves sitemap links when storage fails and reports the failure', async () => {
    mocks.metadata.mockRejectedValue(new Error('read-only filesystem'))
    const text = (await buildLlmsTxtFiles(event()))['/llms.txt']!
    expect(text).toContain('[/about](https://example.com/about.md)')
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('read-only filesystem'))
  })

  it('skips storage and discovery when automatic pages are disabled', async () => {
    mocks.config.pages = false
    expect((await buildLlmsTxtFiles(event()))['/llms.txt']).toBe('# Example\n\nCanonical Origin: https://example.com/\n')
    expect(mocks.groups).not.toHaveBeenCalled()
    expect(mocks.metadata).not.toHaveBeenCalled()
  })
})
