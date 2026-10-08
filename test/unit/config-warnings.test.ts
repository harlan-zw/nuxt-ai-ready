import { describe, expect, it } from 'vitest'
import { resolveConfigurationWarnings } from '../../src/utils/config-warnings'

const defaults = {
  policy: 'auto' as const,
  ssr: true,
  static: false,
  siteUrl: 'https://example.com',
  routeRules: {},
}

describe('resolveConfigurationWarnings', () => {
  it('warns when ISR and unvaried caches disable automatic negotiation', () => {
    const warnings = resolveConfigurationWarnings({
      ...defaults,
      routeRules: {
        '/': { isr: 3600 },
        '/docs/**': { cache: { maxAge: 3600 } },
      },
    })
    expect(warnings).toEqual([
      expect.stringContaining('"/": ISR disables automatic Markdown negotiation'),
      expect.stringContaining('"/docs/**": response caching disables automatic Markdown negotiation'),
    ])
  })

  it('warns when explicit negotiation bypasses cache protection', () => {
    expect(resolveConfigurationWarnings({
      ...defaults,
      policy: 'enabled',
      routeRules: { '/docs/**': { cache: true } },
    })).toEqual([expect.stringContaining('contentNegotiation: true overrides cache protection')])
  })

  it('ignores complete cache variation, disabled caches, and header-only rules', () => {
    expect(resolveConfigurationWarnings({
      ...defaults,
      routeRules: {
        '/': { cache: { varies: ['User-Agent', 'ACCEPT', 'Sec-Fetch-Dest'] as const } },
        '/about': { cache: false, isr: false },
        '/contact': { cache: { headersOnly: true } },
      },
    })).toEqual([])
  })

  it('uses inherited variation when checking a more specific cache rule', () => {
    expect(resolveConfigurationWarnings({
      ...defaults,
      routeRules: {
        '/**': { cache: { varies: ['accept', 'sec-fetch-dest', 'user-agent'] } },
        '/docs/**': { cache: { maxAge: 3600 } },
      },
    })).toEqual([])
  })

  it('ignores non-page routes and redirects', () => {
    expect(resolveConfigurationWarnings({
      ...defaults,
      routeRules: {
        '/api/**': { cache: true },
        '/_nuxt/**': { cache: true },
        '/.well-known/**': { cache: true },
        '/**/*.md': { cache: true },
        '/old': { redirect: '/new', cache: true },
      },
    })).toEqual([])
  })

  it('reports an explicit opt-out once instead of repeating cache warnings', () => {
    expect(resolveConfigurationWarnings({
      ...defaults,
      policy: 'disabled',
      routeRules: { '/': { isr: true }, '/docs/**': { cache: true } },
    })).toEqual([expect.stringContaining('contentNegotiation: false disables Accept and bot negotiation')])
  })

  it.each([undefined, 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])('warns without a public site URL: %s', (siteUrl) => {
    expect(resolveConfigurationWarnings({ ...defaults, siteUrl })).toEqual([
      expect.stringContaining('Set site.url to the public production URL'),
    ])
  })

  it('warns when global or route SSR is disabled', () => {
    expect(resolveConfigurationWarnings({ ...defaults, ssr: false })).toEqual([
      expect.stringContaining('ssr: false can leave public pages unreadable without JavaScript'),
    ])
    expect(resolveConfigurationWarnings({ ...defaults, routeRules: { '/app/**': { ssr: false } } })).toEqual([
      expect.stringContaining('"/app/**": ssr: false can leave this route unreadable without JavaScript'),
    ])
  })

  it('warns that static output needs deployment negotiation', () => {
    expect(resolveConfigurationWarnings({ ...defaults, static: true })).toEqual([
      expect.stringContaining('Static output cannot run Markdown negotiation middleware'),
    ])
  })
})
