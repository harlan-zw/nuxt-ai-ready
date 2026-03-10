/* eslint-disable harlanzw/vue-no-faux-composables */
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the fetch function type
type FetchFn = (url: string, opts?: Record<string, unknown>) => Promise<unknown>

// Inline implementation to test (avoids import issues with nitro runtime)
function useFetch(event?: H3Event): FetchFn {
  if (event?.$fetch)
    return event.$fetch as FetchFn
  return (globalThis as any).$fetch as FetchFn
}

// Inline implementation for fetchPublicAsset
interface CloudflareEnv {
  ASSETS?: { fetch: (req: Request | string) => Promise<Response> }
}

async function fetchPublicAsset<T = unknown>(
  event: H3Event | undefined,
  path: string,
  options?: { responseType?: 'json' | 'text' | 'arrayBuffer' },
): Promise<T | null> {
  const responseType = options?.responseType ?? 'json'
  const cfEnv = (event?.context?.cloudflare?.env
    ?? (globalThis as any).__env__) as CloudflareEnv | undefined

  if (cfEnv?.ASSETS?.fetch) {
    const response = await cfEnv.ASSETS.fetch(
      new Request(`https://assets.local${path}`),
    ).catch(() => null)

    if (response?.ok) {
      if (responseType === 'json')
        return response.json().catch(() => null)
      if (responseType === 'text')
        return response.text().catch(() => null) as T
    }
    return null
  }

  // Fallback to globalThis.$fetch
  return (globalThis as any).$fetch(path, {
    baseURL: '/',
    responseType: responseType === 'arrayBuffer' ? 'arrayBuffer' : undefined,
  }).catch(() => null) as Promise<T | null>
}

describe('cron context utilities', () => {
  const originalGlobalFetch = (globalThis as any).$fetch
  const originalEnv = (globalThis as any).__env__

  beforeEach(() => {
    // Reset globals before each test
    ;(globalThis as any).$fetch = undefined
    ;(globalThis as any).__env__ = undefined
  })

  afterEach(() => {
    // Restore globals after each test
    ;(globalThis as any).$fetch = originalGlobalFetch
    ;(globalThis as any).__env__ = originalEnv
  })

  describe('useFetch', () => {
    it('uses event.$fetch when event is provided', () => {
      const mockEventFetch = vi.fn()
      const mockEvent = { $fetch: mockEventFetch } as unknown as H3Event

      const $fetch = useFetch(mockEvent)

      expect($fetch).toBe(mockEventFetch)
    })

    it('falls back to globalThis.$fetch when no event', () => {
      const mockGlobalFetch = vi.fn()
      ;(globalThis as any).$fetch = mockGlobalFetch

      const $fetch = useFetch(undefined)

      expect($fetch).toBe(mockGlobalFetch)
    })

    it('falls back to globalThis.$fetch when event has no $fetch', () => {
      const mockGlobalFetch = vi.fn()
      ;(globalThis as any).$fetch = mockGlobalFetch
      const mockEvent = {} as unknown as H3Event

      const $fetch = useFetch(mockEvent)

      expect($fetch).toBe(mockGlobalFetch)
    })
  })

  describe('fetchPublicAsset', () => {
    it('uses ASSETS binding from event context', async () => {
      const mockJson = { test: 'data' }
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockJson),
      }
      const mockAssetsFetch = vi.fn().mockResolvedValue(mockResponse)

      const mockEvent = {
        context: {
          cloudflare: {
            env: {
              ASSETS: { fetch: mockAssetsFetch },
            },
          },
        },
      } as unknown as H3Event

      const result = await fetchPublicAsset(mockEvent, '/test.json')

      expect(mockAssetsFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://assets.local/test.json',
        }),
      )
      expect(result).toEqual(mockJson)
    })

    it('uses globalThis.__env__.ASSETS when no event', async () => {
      const mockJson = { test: 'data' }
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockJson),
      }
      const mockAssetsFetch = vi.fn().mockResolvedValue(mockResponse)

      ;(globalThis as any).__env__ = {
        ASSETS: { fetch: mockAssetsFetch },
      }

      const result = await fetchPublicAsset(undefined, '/test.json')

      expect(mockAssetsFetch).toHaveBeenCalled()
      expect(result).toEqual(mockJson)
    })

    it('falls back to globalThis.$fetch when no ASSETS binding', async () => {
      const mockData = { fallback: true }
      const mockGlobalFetch = vi.fn().mockResolvedValue(mockData)
      ;(globalThis as any).$fetch = mockGlobalFetch

      const result = await fetchPublicAsset(undefined, '/fallback.json')

      expect(mockGlobalFetch).toHaveBeenCalledWith('/fallback.json', {
        baseURL: '/',
        responseType: undefined,
      })
      expect(result).toEqual(mockData)
    })

    it('returns text when responseType is text', async () => {
      const mockText = 'plain text content'
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue(mockText),
      }
      const mockAssetsFetch = vi.fn().mockResolvedValue(mockResponse)

      ;(globalThis as any).__env__ = {
        ASSETS: { fetch: mockAssetsFetch },
      }

      const result = await fetchPublicAsset(undefined, '/test.txt', { responseType: 'text' })

      expect(mockResponse.text).toHaveBeenCalled()
      expect(result).toBe(mockText)
    })

    it('returns null when ASSETS fetch fails', async () => {
      const mockAssetsFetch = vi.fn().mockRejectedValue(new Error('Network error'))

      ;(globalThis as any).__env__ = {
        ASSETS: { fetch: mockAssetsFetch },
      }

      const result = await fetchPublicAsset(undefined, '/error.json')

      expect(result).toBeNull()
    })

    it('returns null when response is not ok', async () => {
      const mockResponse = { ok: false }
      const mockAssetsFetch = vi.fn().mockResolvedValue(mockResponse)

      ;(globalThis as any).__env__ = {
        ASSETS: { fetch: mockAssetsFetch },
      }

      const result = await fetchPublicAsset(undefined, '/not-found.json')

      expect(result).toBeNull()
    })
  })

  describe('scheduled task simulation', () => {
    it('simulates Cloudflare Workers cron context', async () => {
      // Simulate what Cloudflare Workers provides in scheduled task context
      const mockD1 = { prepare: vi.fn() }
      const mockAssetsFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ buildId: 'test-123', pageCount: 10 }),
      })

      ;(globalThis as any).__env__ = {
        DB: mockD1,
        ASSETS: { fetch: mockAssetsFetch },
      }

      // Mock global $fetch for page fetching
      ;(globalThis as any).$fetch = vi.fn().mockResolvedValue('<html>test</html>')

      // Verify useFetch works without event
      const $fetch = useFetch(undefined)
      expect($fetch).toBe((globalThis as any).$fetch)

      // Verify fetchPublicAsset works without event
      const meta = await fetchPublicAsset(undefined, '/__ai-ready/pages.meta.json')
      expect(meta).toEqual({ buildId: 'test-123', pageCount: 10 })
    })
  })
})
