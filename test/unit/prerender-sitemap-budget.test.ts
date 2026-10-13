import type { Nuxt } from '@nuxt/schema'
import type { Nitro } from 'nitropack/types'
import type { CrawlerState } from '../../src/prerender'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../src/logger'
import { crawlConfiguredSitemaps, crawlSitemapContent } from '../../src/prerender'

vi.mock('nuxtseo-shared/prerender', () => ({ createPrerenderFetch: vi.fn() }))
afterEach(() => vi.restoreAllMocks())

const origin = 'https://example.com'
const index = (paths: string[]) => `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<sitemap><loc>${origin}/registry${path}</loc></sitemap>`).join('')}</sitemapindex>`
const urlset = (path: string) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/registry${path}</loc></url></urlset>`

function setup(routes: Record<string, string> = {}) {
  const fetch = vi.fn(async (path: string) => {
    if (path.endsWith('.xml'))
      return routes[path] || urlset(path.replace('.xml', ''))
    return JSON.stringify({ markdown: '# Page', title: 'Page', description: '', headings: [] })
  })
  const state: CrawlerState = { fetch: fetch as unknown as CrawlerState['fetch'], prerenderedRoutes: new Set(), errorRoutes: new Set(), totalProcessingTime: 0, initialized: true, concurrency: 10, siteInfo: { url: origin } }
  const nuxt = { hooks: { callHook: vi.fn(async () => {}) } } as unknown as Nuxt
  const nitro = { options: { baseURL: '/registry/', static: false, prerender: { ignore: [] } } } as unknown as Nitro
  return { state, nuxt, nitro, fetch }
}

describe('trusted prerender sitemap documents', () => {
  it('crawls normalized automatic chunks through their generated index during Nuxt generate', async () => {
    const { state, nuxt, nitro, fetch } = setup()
    state.llmsTxtConfig = { sitemaps: ['chunks'] }
    const documents = new Map([
      ['/sitemap_index.xml', () => index(['/chunks/0.xml'])],
      ['/chunks/0.xml', () => urlset('/selected')],
    ])
    await crawlConfiguredSitemaps(state, nuxt, nitro, { sitemaps: { index: { sitemapName: 'index', _route: '/registry/sitemap_index.xml' }, chunks: { sitemapName: 'chunks' } } }, documents)
    expect(state.prerenderedRoutes.has('/selected')).toBe(true)
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('.xml'))).toHaveLength(0)
  })

  it('admits all 102 locally generated chunks without consuming the fetched document budget', async () => {
    const { state, nuxt, nitro, fetch } = setup()
    const paths = Array.from({ length: 102 }, (_, i) => `/chunks/${i}.xml`)
    const documents = new Map(paths.map((path, i) => [path, () => urlset(`/page-${i}`)]))
    const crawled = await crawlSitemapContent(state, nuxt, nitro, index([...paths, '/remote.xml']), new Set(), 0, documents)
    expect(crawled).toBe(103)
    expect(state.prerenderedRoutes.has('/page-101')).toBe(true)
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('.xml')).map(([path]) => path)).toEqual(['/registry/remote.xml'])
  })

  it('keeps the 100-document bound for fetched chunks and still reads subsequent trusted chunks', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { state, nuxt, nitro, fetch } = setup()
    const paths = Array.from({ length: 102 }, (_, i) => `/remote-${i}.xml`)
    const documents = new Map([['/local.xml', () => urlset('/trusted')]])
    const crawled = await crawlSitemapContent(state, nuxt, nitro, index([...paths, '/local.xml']), new Set(), 0, documents)
    expect(crawled).toBe(101)
    expect(state.prerenderedRoutes.has('/trusted')).toBe(true)
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('.xml'))).toHaveLength(100)
    expect(warning).toHaveBeenCalledOnce()
  })

  it('reads a trusted document once across query, fragment, and base URL aliases', async () => {
    const { state, nuxt, nitro, fetch } = setup()
    const local = vi.fn(() => urlset('/trusted'))
    const variants = Array.from({ length: 150 }, (_, i) => `/local.xml?item=${i}`)
    const content = index([...variants, '/local.xml#first', '/local.xml#second']).replace('</sitemapindex>', `<sitemap><loc>${origin}/local.xml?logical=1</loc></sitemap></sitemapindex>`)
    const crawled = await crawlSitemapContent(state, nuxt, nitro, content, new Set(), 0, new Map([['/local.xml', local]]))
    expect(local).toHaveBeenCalledOnce()
    expect(crawled).toBe(1)
    expect([...state.prerenderedRoutes]).toEqual(['/trusted'])
    expect(fetch.mock.calls.filter(([path]) => path.includes('.xml'))).toHaveLength(0)
  })

  it('keeps distinct fetched query documents inside the untrusted document budget', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const paths = Array.from({ length: 102 }, (_, i) => `/remote.xml?item=${i}`)
    const routes = Object.fromEntries(paths.map((path, i) => [`/registry${path}`, urlset(`/page-${i}`)]))
    const { state, nuxt, nitro, fetch } = setup(routes)
    fetch.mockImplementation(async path => routes[path] || JSON.stringify({ markdown: '# Page', title: 'Page', description: '', headings: [] }))
    const crawled = await crawlSitemapContent(state, nuxt, nitro, index(paths))
    expect(crawled).toBe(100)
    expect(fetch.mock.calls.filter(([path]) => path.includes('.xml?'))).toHaveLength(100)
    expect(state.prerenderedRoutes.has('/page-99')).toBe(true)
    expect(state.prerenderedRoutes.has('/page-100')).toBe(false)
  })
})
