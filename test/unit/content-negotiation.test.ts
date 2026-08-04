import { describe, expect, it } from 'vitest'
import { resolveContentNegotiation } from '../../src/runtime/server/utils/content-negotiation'

describe('resolveContentNegotiation', () => {
  it('enables negotiation by default for an uncached route', () => {
    expect(resolveContentNegotiation({
      policy: 'auto',
      routeRule: {},
    })).toEqual({ _tag: 'enabled', source: 'default' })
  })

  it.each([
    true,
    3600,
    { expiration: 3600 },
  ])('disables negotiation for an ISR route rule using %o', (isr) => {
    expect(resolveContentNegotiation({
      policy: 'auto',
      routeRule: { isr },
    })).toEqual({ _tag: 'disabled', source: 'isr' })
  })

  it('ignores disabled ISR route rules', () => {
    expect(resolveContentNegotiation({
      policy: 'auto',
      routeRule: { isr: false },
    })).toEqual({ _tag: 'enabled', source: 'default' })
  })

  it.each([
    {},
    { maxAge: 3600 },
    { swr: true },
    { maxAge: 3600, varies: ['accept', 'sec-fetch-dest'] },
  ])('disables negotiation for a route cache without complete variation using %o', (cache) => {
    expect(resolveContentNegotiation({
      policy: 'auto',
      routeRule: { cache },
    })).toEqual({ _tag: 'disabled', source: 'route-cache' })
  })

  it('keeps negotiation when the route cache varies on every negotiation input', () => {
    expect(resolveContentNegotiation({
      policy: 'auto',
      routeRule: {
        cache: {
          maxAge: 3600,
          varies: ['User-Agent', 'ACCEPT', 'Sec-Fetch-Dest'],
        },
      },
    })).toEqual({ _tag: 'enabled', source: 'default' })
  })

  it.each([
    false,
    { headersOnly: true },
  ] as const)('keeps negotiation for a non-response route cache using %o', (cache) => {
    expect(resolveContentNegotiation({
      policy: 'auto',
      routeRule: { cache },
    })).toEqual({ _tag: 'enabled', source: 'default' })
  })

  it.each(['enabled', 'disabled'] as const)('honors an explicit %s override before route caching', (policy) => {
    expect(resolveContentNegotiation({
      policy,
      routeRule: {
        isr: true,
        cache: { maxAge: 3600 },
      },
    })._tag).toBe(policy)
  })
})
