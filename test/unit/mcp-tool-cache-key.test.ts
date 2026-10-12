import { describe, expect, it } from 'vitest'
import { siteToolCacheKey } from '../../src/runtime/server/mcp/cache-key'

describe('siteToolCacheKey', () => {
  it.each([
    [{ route: '/guide/setup' }, { route: '/guide-setup' }],
    [{ route: '/guide' }, { route: 'guide' }],
    [{ query: 'nuxt seo', limit: 10 }, { query: 'nuxt', limit: 10 }],
    [{ query: 'nuxt', limit: 10 }, { query: 'nuxt', limit: 1 }],
  ])('gives distinct arguments distinct keys: %#', (a, b) => {
    expect(siteToolCacheKey(a)).not.toBe(siteToolCacheKey(b))
  })

  it('gives the same arguments the same key', () => {
    expect(siteToolCacheKey({ query: 'nuxt', limit: 5 })).toBe(siteToolCacheKey({ limit: 5, query: 'nuxt' }))
  })

  it('keeps keys URL safe and one length for any argument text', () => {
    const keys = ['/guide/setup', '/search?q=nuxt#results', '/über/straße', 'x'.repeat(4096)]
      .map(route => siteToolCacheKey({ route }))
    for (const key of keys)
      expect(key).toMatch(/^[\w-]+$/)
    expect(new Set(keys.map(key => key.length)).size).toBe(1)
  })
})
