import { describe, expect, it } from 'vitest'
import { resolveContentNegotiation } from '../../src/utils/content-negotiation'

describe('resolveContentNegotiation', () => {
  it('enables negotiation by default without ISR', () => {
    expect(resolveContentNegotiation({
      configured: undefined,
      routeRules: {},
    })).toEqual({ _tag: 'enabled', source: 'default' })
  })

  it.each([
    true,
    3600,
    { expiration: 3600 },
  ])('disables negotiation for an ISR route rule using %o', (isr) => {
    expect(resolveContentNegotiation({
      configured: undefined,
      routeRules: { '/**': { isr } },
    })).toEqual({ _tag: 'disabled', source: 'isr', route: '/**' })
  })

  it('ignores disabled ISR route rules', () => {
    expect(resolveContentNegotiation({
      configured: undefined,
      routeRules: { '/**': { isr: false } },
    })).toEqual({ _tag: 'enabled', source: 'default' })
  })

  it.each([true, false])('honors an explicit %s override with ISR', (configured) => {
    expect(resolveContentNegotiation({
      configured,
      routeRules: { '/**': { isr: true } },
    })._tag).toBe(configured ? 'enabled' : 'disabled')
  })
})
