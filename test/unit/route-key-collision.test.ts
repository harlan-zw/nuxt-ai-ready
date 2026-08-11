import { describe, expect, it } from 'vitest'
import { normalizeRoute, normalizeRouteKey } from '../../src/runtime/server/db/shared'

describe('route canonicalisation', () => {
  it('stores the home page under one route whichever way it is spelled', () => {
    // `route` and `route_key` each carry a UNIQUE index, and the upsert targets
    // `ON CONFLICT(route)`. If two spellings of one page disagree on `route`,
    // the conflict target misses and the write lands on the `route_key` index
    // as a constraint failure instead of an update.
    expect(normalizeRoute('')).toBe(normalizeRoute('/'))
  })

  it('gives a bare path the same route as its rooted form', () => {
    expect(normalizeRoute('about')).toBe(normalizeRoute('/about'))
  })

  it('leaves an ordinary route untouched', () => {
    expect(normalizeRoute('/about/team')).toBe('/about/team')
  })

  it('agrees with the key it derives, so equal keys imply equal routes', () => {
    const spellings = ['', '/', 'about', '/about', '/about/team', 'about/team']
    for (const left of spellings) {
      for (const right of spellings) {
        if (normalizeRouteKey(left) !== normalizeRouteKey(right))
          continue
        // A shared key must mean a shared row, or the unique index rejects one.
        expect(normalizeRoute(left)).toBe(normalizeRoute(right))
      }
    }
  })

  it('keeps the documented key shapes', () => {
    expect(normalizeRouteKey('/about/team')).toBe('about:team')
    expect(normalizeRouteKey('/')).toBe('index')
    expect(normalizeRouteKey('')).toBe('index')
  })
})
