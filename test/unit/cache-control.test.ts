import { describe, expect, it } from 'vitest'
import { publicCacheControl } from '../../src/runtime/cache-control'

// Cloudflare turns off stale serving when `s-maxage` is present, so the
// stale window would never apply at the edge.
describe('publicCacheControl', () => {
  it('sets freshness through max-age and never through s-maxage', () => {
    expect(publicCacheControl(3600, 86400)).toBe('public, max-age=3600, stale-while-revalidate=86400')
  })

  it('omits the stale window when it is zero', () => {
    expect(publicCacheControl(600, 0)).toBe('public, max-age=600')
  })
})
