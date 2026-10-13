import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CachedFunctionOptions { name?: string, group?: string, maxAge?: number, swr?: boolean }

const config = { llmsTxtCacheSeconds: 600 }

const { defineCachedFunction, buildLlmsTxtFiles } = vi.hoisted(() => ({
  defineCachedFunction: vi.fn(
    (fn: (...args: unknown[]) => unknown, options?: { name?: string, group?: string, maxAge?: number, swr?: boolean, getKey?: (event: unknown) => string }) => {
      const snapshots = new Map<string, unknown>()
      return async (...args: unknown[]) => {
        const key = options?.getKey?.(args[0]) || ''
        if (!snapshots.has(key))
          snapshots.set(key, await fn(...args))
        return snapshots.get(key)
      }
    },
  ),
  buildLlmsTxtFiles: vi.fn(async (): Promise<Record<string, string>> => ({ '/llms.txt': '# llms.txt content' })),
}))

vi.mock('#nuxtseo/nitro', () => ({
  defineCachedFunction,
  useRuntimeConfig: () => ({ 'app': { baseURL: '/' }, 'nuxt-ai-ready': config }),
}))

vi.mock('../../src/runtime/llms-txt-utils', () => ({ buildLlmsTxtFiles }))

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
    expect(cachedOptions()[0]).toMatchObject({ name: 'llms-txt-files', group: 'ai-ready', maxAge: 1200, swr: true })
    expect(cacheControl).toContain('max-age=1200')
    expect(cacheControl).not.toContain('s-maxage')
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

  it('shares root and child snapshots while isolating forwarded origins', async () => {
    config.llmsTxtCacheSeconds = 47
    buildLlmsTxtFiles.mockResolvedValueOnce({ '/llms.txt': 'First root', '/llms/skills.txt': 'First skills' })
    buildLlmsTxtFiles.mockResolvedValueOnce({ '/llms.txt': 'Second root', '/llms/skills.txt': 'Second skills' })
    async function read(path: string, host: string) {
      return (await request(new Request(`http://localhost${path}`, { headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } }))).text()
    }
    expect(await read('/llms.txt', 'first.example.com')).toBe('First root')
    expect(await read('/llms/skills.txt', 'first.example.com')).toBe('First skills')
    expect(await read('/llms/skills.txt', 'second.example.com')).toBe('Second skills')
    expect(await read('/llms.txt', 'second.example.com')).toBe('Second root')
    expect(buildLlmsTxtFiles).toHaveBeenCalledTimes(2)
  })
})
