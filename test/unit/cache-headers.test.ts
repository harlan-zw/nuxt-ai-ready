import { describe, expect, it } from 'vitest'

// Test the cache header generation logic
function buildCacheControl(maxAge: number, swr: boolean): string {
  return swr
    ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
    : `public, max-age=${maxAge}`
}

describe('cache headers', () => {
  it('generates cache-control with swr enabled', () => {
    const result = buildCacheControl(3600, true)
    expect(result).toBe('public, max-age=3600, stale-while-revalidate=3600')
  })

  it('generates cache-control with swr disabled', () => {
    const result = buildCacheControl(3600, false)
    expect(result).toBe('public, max-age=3600')
  })

  it('handles different maxAge values', () => {
    const result = buildCacheControl(7200, true)
    expect(result).toBe('public, max-age=7200, stale-while-revalidate=7200')
  })

  it('handles zero maxAge', () => {
    const result = buildCacheControl(0, false)
    expect(result).toBe('public, max-age=0')
  })
})
