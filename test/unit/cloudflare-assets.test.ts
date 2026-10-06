import { afterEach, describe, expect, it, vi } from 'vitest'
import { DB_CONTEXT_KEY, DB_PROMISE_CONTEXT_KEY, DB_WORK_CONTEXT_KEY } from '../../src/runtime/server/db/context'
import { fetchPublicAsset } from '../../src/runtime/server/utils/cloudflare'

const localFetch = vi.hoisted(() => vi.fn())

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ app: { baseURL: '/docs/' } }),
  localFetch,
}))

describe('fetchPublicAsset', () => {
  afterEach(() => {
    localFetch.mockReset()
    delete (globalThis as { __env__?: unknown }).__env__
    vi.unstubAllGlobals()
  })

  it('returns the Cloudflare asset response stream without buffering', async () => {
    const response = new Response('<urlset></urlset>')
    const body = response.body
    const text = vi.spyOn(response, 'text')
    const fetch = vi.fn(async () => response)
    ;(globalThis as { __env__?: unknown }).__env__ = { ASSETS: { fetch } }

    const result = await fetchPublicAsset<ReadableStream<Uint8Array>>(
      undefined,
      '/sitemap.xml',
      { responseType: 'stream' },
    )

    expect(result).toBe(body)
    expect(text).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('self-fetches the asset beneath the app base URL without an ASSETS binding', async () => {
    localFetch.mockResolvedValue(new Response(JSON.stringify({ buildId: 'b1', pageCount: 1 }), { headers: { 'content-type': 'application/json' } }))

    await fetchPublicAsset(undefined, '/__ai-ready/pages.meta.json')

    expect(localFetch).toHaveBeenCalledWith('/docs/__ai-ready/pages.meta.json', expect.anything(), undefined)
  })

  it('retries a temporary failure and preserves request context', async () => {
    const event = { context: { task: 'restore' } }
    const failure = new Response('Unavailable', { status: 503 })
    const cancel = vi.spyOn(failure.body!, 'cancel')
    localFetch.mockResolvedValueOnce(failure).mockResolvedValueOnce(new Response('stored asset'))

    expect(await fetchPublicAsset(event, '/asset.txt', { responseType: 'text' })).toBe('stored asset')
    expect(cancel).toHaveBeenCalledOnce()
    expect(localFetch).toHaveBeenCalledTimes(2)
    expect(localFetch).toHaveBeenLastCalledWith('/docs/asset.txt', expect.anything(), event.context)
  })

  it('does not retry a missing asset', async () => {
    localFetch.mockResolvedValue(new Response('Missing', { status: 404 }))

    expect(await fetchPublicAsset(undefined, '/missing.txt', { responseType: 'text' })).toBeNull()
    expect(localFetch).toHaveBeenCalledOnce()
  })

  it('keeps the parent database open when a nested asset response finishes', async () => {
    const database = { closed: false }
    const cloudflare = { env: { D1: 'binding' } }
    const context = {
      cloudflare,
      task: 'restore',
      [DB_CONTEXT_KEY]: database,
      [DB_PROMISE_CONTEXT_KEY]: Promise.resolve(database),
      [DB_WORK_CONTEXT_KEY]: { _tag: 'ResponseOpen', pending: new Set() },
    }
    localFetch.mockImplementation(async (_path, _options, nestedContext) => {
      if (nestedContext[DB_CONTEXT_KEY])
        nestedContext[DB_CONTEXT_KEY].closed = true
      expect(nestedContext.cloudflare).toBe(cloudflare)
      expect(nestedContext.task).toBe('restore')
      expect(nestedContext[DB_PROMISE_CONTEXT_KEY]).toBeUndefined()
      expect(nestedContext[DB_WORK_CONTEXT_KEY]).toBeUndefined()
      return new Response('asset')
    })

    expect(await fetchPublicAsset({ context }, '/asset.txt', { responseType: 'text' })).toBe('asset')
    expect(database.closed).toBe(false)
    expect(context[DB_CONTEXT_KEY]).toBe(database)
  })
})
