import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPageLastmods: vi.fn(),
  getSitemapLastCrawledAt: vi.fn(),
  markSitemapSeeded: vi.fn(),
  runtimeConfig: { 'nuxt-ai-ready': { debug: false } } as Record<string, unknown>,
  seedRoutes: vi.fn(),
}))

vi.mock('../../src/runtime/server/db/queries', () => ({
  getPageLastmods: mocks.getPageLastmods,
  getSitemapLastCrawledAt: mocks.getSitemapLastCrawledAt,
  markSitemapSeeded: mocks.markSitemapSeeded,
  resolveSeedRefreshWindowMs: () => 24 * 60 * 60 * 1000,
  seedRoutes: mocks.seedRoutes,
}))

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => mocks.runtimeConfig,
}))

vi.mock('#ai-ready-virtual/logger.mjs', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

type ResolvedHandler = (ctx: { urls: Array<{ loc: string, lastmod?: string | Date }>, sitemapName: string, event: H3Event }) => Promise<void>

async function loadHandler(): Promise<ResolvedHandler> {
  vi.resetModules()
  const hooks = new Map<string, ResolvedHandler>()
  const nitroApp = {
    hooks: {
      hook: (name: string, fn: ResolvedHandler) => hooks.set(name, fn),
    },
  }
  const { default: plugin } = await import('../../src/runtime/server/plugins/sitemap-seeder')
  plugin(nitroApp as never)
  const handler = hooks.get('sitemap:resolved')
  if (!handler)
    throw new Error('sitemap:resolved hook not registered')
  return handler
}

function makeEvent() {
  const deferred: Promise<unknown>[] = []
  const event = {
    context: {},
    waitUntil: (p: Promise<unknown>) => deferred.push(p),
  } as unknown as H3Event
  return { deferred, event }
}

async function runHandler(handler: ResolvedHandler, sitemapName = 'sitemap.xml'): Promise<void> {
  const { deferred, event } = makeEvent()
  const done = handler({ urls: [{ loc: 'https://example.com/about' }], sitemapName, event })
  await vi.advanceTimersByTimeAsync(3500)
  await done
  await Promise.all(deferred)
}

describe('sitemap-seeder throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.getPageLastmods.mockReset().mockResolvedValue(new Map())
    mocks.getSitemapLastCrawledAt.mockReset()
    mocks.markSitemapSeeded.mockReset().mockResolvedValue(undefined)
    mocks.seedRoutes.mockReset().mockResolvedValue(1)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('seeds source dates before adding dates from the index', async () => {
    mocks.getPageLastmods.mockResolvedValue(new Map([
      ['/about', '2026-08-02'],
      ['/source', '2026-08-03'],
    ]))
    mocks.getSitemapLastCrawledAt.mockResolvedValue(null)
    const handler = await loadHandler()
    const { deferred, event } = makeEvent()
    const urls = [
      { loc: 'https://example.com/about' },
      { loc: 'https://example.com/source', lastmod: '2026-08-01' },
    ]

    await handler({ urls, sitemapName: 'sitemap.xml', event })
    await Promise.all(deferred)

    expect(mocks.seedRoutes).toHaveBeenCalledWith(event, [
      { route: '/about', url: 'https://example.com/about', lastmod: undefined },
      { route: '/source', url: 'https://example.com/source', lastmod: '2026-08-01' },
    ], { refreshWindowMs: 24 * 60 * 60 * 1000 })
    expect(urls).toEqual([
      { loc: 'https://example.com/about', lastmod: '2026-08-02' },
      { loc: 'https://example.com/source', lastmod: '2026-08-01' },
    ])
  })

  it('throttles re-seeding while the throttle read times out', async () => {
    mocks.getSitemapLastCrawledAt.mockImplementation(() => new Promise(() => {}))
    const handler = await loadHandler()

    await runHandler(handler)
    expect(mocks.seedRoutes).toHaveBeenCalledTimes(1)

    await runHandler(handler)
    expect(mocks.seedRoutes).toHaveBeenCalledTimes(1)
  })

  it('re-seeds after the interval expires even when reads keep timing out', async () => {
    mocks.getSitemapLastCrawledAt.mockImplementation(() => new Promise(() => {}))
    const handler = await loadHandler()

    await runHandler(handler)
    expect(mocks.seedRoutes).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000)

    await runHandler(handler)
    expect(mocks.seedRoutes).toHaveBeenCalledTimes(2)
  })

  it('a recent durable timestamp throttles without seeding', async () => {
    mocks.getSitemapLastCrawledAt.mockResolvedValue(Date.now() - 60_000)
    const handler = await loadHandler()

    await runHandler(handler)

    expect(mocks.seedRoutes).not.toHaveBeenCalled()
  })

  it('throttles per sitemap, not globally', async () => {
    mocks.getSitemapLastCrawledAt.mockImplementation(() => new Promise(() => {}))
    const handler = await loadHandler()

    await runHandler(handler, 'sitemap.xml')
    expect(mocks.seedRoutes).toHaveBeenCalledTimes(1)

    await runHandler(handler, 'docs.xml')
    expect(mocks.seedRoutes).toHaveBeenCalledTimes(2)
  })
})
