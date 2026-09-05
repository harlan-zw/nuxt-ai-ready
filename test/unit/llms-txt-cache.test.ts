import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CachedFunctionOptions { name?: string, group?: string, maxAge?: number, swr?: boolean }

const config = { llmsTxtCacheSeconds: 600 }

const { defineCachedFunction, buildLlmsTxt } = vi.hoisted(() => ({
  defineCachedFunction: vi.fn(
    (fn: (...args: unknown[]) => unknown, _options?: { name?: string, group?: string, maxAge?: number, swr?: boolean }) =>
      async (...args: unknown[]) => fn(...args),
  ),
  buildLlmsTxt: vi.fn(async () => '# llms.txt content'),
}))

vi.mock('#nuxtseo/nitro', () => ({
  defineCachedFunction,
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
}))

vi.mock('../../src/runtime/llms-txt-utils', () => ({ buildLlmsTxt }))

const { default: llmsTxtHandler } = await import('../../src/runtime/server/routes/llms.txt.get')

const app = createApp()
app.use(llmsTxtHandler)
const request = toWebHandler(app)

async function getLlmsTxt() {
  const response = await request(new Request('http://localhost/llms.txt'))
  return {
    status: response.status,
    body: await response.text(),
    cacheControl: response.headers.get('cache-control'),
  }
}

function cachedOptions() {
  return defineCachedFunction.mock.calls.map(call => call[1] as CachedFunctionOptions | undefined)
}

describe('gET /llms.txt internal cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.llmsTxtCacheSeconds = 600
  })

  it('uses llmsTxtCacheSeconds as the cached function maxAge', async () => {
    config.llmsTxtCacheSeconds = 1200

    const { status, body, cacheControl } = await getLlmsTxt()

    expect(status).toBe(200)
    expect(body).toBe('# llms.txt content')
    expect(defineCachedFunction).toHaveBeenCalledOnce()
    expect(cachedOptions()[0]).toMatchObject({ name: 'llms-txt', group: 'ai-ready', maxAge: 1200, swr: true })
    expect(cacheControl).toContain('max-age=1200')
  })

  it('builds one cached function per configured value', async () => {
    config.llmsTxtCacheSeconds = 300
    await getLlmsTxt()
    await getLlmsTxt()
    config.llmsTxtCacheSeconds = 60
    await getLlmsTxt()

    const maxAges = cachedOptions().map(options => options?.maxAge)
    expect(maxAges.filter(maxAge => maxAge === 300)).toHaveLength(1)
    expect(maxAges.filter(maxAge => maxAge === 60)).toHaveLength(1)
  })

  it('bypasses the cached function when caching is disabled', async () => {
    config.llmsTxtCacheSeconds = 0

    const { status, cacheControl } = await getLlmsTxt()

    expect(status).toBe(200)
    expect(defineCachedFunction).not.toHaveBeenCalled()
    expect(cacheControl).toBeNull()
  })
})
