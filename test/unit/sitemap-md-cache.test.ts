import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CachedFunctionOptions { name?: string, group?: string, maxAge?: number, swr?: boolean }

const config = { llmsTxtCacheSeconds: 600 }

const mocks = vi.hoisted(() => ({
  pages: [] as Array<{ route: string, title?: string, updatedAt?: string }>,
  queryPages: vi.fn(),
  defineCachedFunction: vi.fn(),
}))

vi.mock('#nuxtseo/nitro', () => ({
  defineCachedFunction: mocks.defineCachedFunction,
  useRuntimeConfig: () => ({ 'app': { baseURL: '/' }, 'nuxt-ai-ready': config }),
}))

vi.mock('#site-config/server/composables', () => ({
  getSiteConfig: () => ({ name: 'Example Site' }),
}))

vi.mock('../../src/runtime/server/db/queries', () => ({
  queryPages: mocks.queryPages,
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

// A real in-memory TTL cache so the cached-value semantics are exercised,
// not just the shape of the defineCachedFunction call.
mocks.defineCachedFunction.mockImplementation(
  (fn: (...args: unknown[]) => Promise<unknown>, options?: { maxAge?: number }) => {
    let stored: { value: unknown, expiresAt: number } | undefined
    return async (...args: unknown[]) => {
      const now = Date.now()
      if (stored && stored.expiresAt > now)
        return stored.value
      const value = await fn(...args)
      stored = { value, expiresAt: now + (options?.maxAge ?? 0) * 1000 }
      return value
    }
  },
)

mocks.queryPages.mockImplementation(async () => mocks.pages)

const { default: sitemapMdHandler } = await import('../../src/runtime/server/routes/sitemap.md.get')

const app = createApp()
app.use(sitemapMdHandler)
const request = toWebHandler(app)

async function getSitemapMd() {
  const response = await request(new Request('http://localhost/sitemap.md'))
  return {
    status: response.status,
    body: await response.text(),
    cacheControl: response.headers.get('cache-control'),
  }
}

function cachedOptions() {
  return mocks.defineCachedFunction.mock.calls.map(call => call[1] as CachedFunctionOptions | undefined)
}

describe('gET /sitemap.md internal cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.llmsTxtCacheSeconds = 600
    mocks.pages.length = 0
    mocks.queryPages.mockImplementation(async () => mocks.pages)
    mocks.defineCachedFunction.mockImplementation(
      (fn: (...args: unknown[]) => Promise<unknown>, options?: { maxAge?: number }) => {
        let stored: { value: unknown, expiresAt: number } | undefined
        return async (...args: unknown[]) => {
          const now = Date.now()
          if (stored && stored.expiresAt > now)
            return stored.value
          const value = await fn(...args)
          stored = { value, expiresAt: now + (options?.maxAge ?? 0) * 1000 }
          return value
        }
      },
    )
  })

  it('serves the cached sitemap within the TTL even after the database changes', async () => {
    mocks.pages.push({ route: '/about', title: 'About' })

    const first = await getSitemapMd()
    expect(first.status).toBe(200)
    expect(first.body).toContain('- [About](/about.md)')

    // A second page lands in the database within the cache TTL.
    mocks.pages.push({ route: '/docs/api', title: 'API' })
    const second = await getSitemapMd()

    expect(second.body).toContain('- [About](/about.md)')
    expect(second.body).not.toContain('/docs/api.md')
  })

  it('uses llmsTxtCacheSeconds as the cached function maxAge', async () => {
    config.llmsTxtCacheSeconds = 1200

    const { status, body, cacheControl } = await getSitemapMd()

    expect(status).toBe(200)
    expect(body).toContain('# Example Site Sitemap')
    expect(cachedOptions()[0]).toMatchObject({ name: 'sitemap-md', group: 'ai-ready', maxAge: 1200, swr: true })
    expect(cacheControl).toContain('max-age=1200')
  })

  it('bypasses the cached function when caching is disabled', async () => {
    config.llmsTxtCacheSeconds = 0

    const { status, cacheControl } = await getSitemapMd()

    expect(status).toBe(200)
    expect(mocks.defineCachedFunction).not.toHaveBeenCalled()
    expect(cacheControl).toBeNull()
  })
})
