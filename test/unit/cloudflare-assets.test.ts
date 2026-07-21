import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPublicAsset } from '../../src/runtime/server/utils/cloudflare'

describe('fetchPublicAsset', () => {
  afterEach(() => {
    delete (globalThis as { __env__?: unknown }).__env__
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
})
