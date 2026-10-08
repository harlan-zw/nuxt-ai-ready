import { describe, expect, it } from 'vitest'
import { resolveConfigurationWarnings } from '../../src/utils/config-warnings'

const defaults = {
  policy: 'auto' as const,
  static: false,
  siteUrl: 'https://example.com',
  routeRules: {},
}

describe('resolveConfigurationWarnings', () => {
  it('includes a working cache fix and explains why HTTP Vary alone is insufficient', () => {
    const varies = ['accept', 'sec-fetch-dest', 'user-agent']
    const [warning] = resolveConfigurationWarnings({ ...defaults, routeRules: { '/docs/**': { cache: { maxAge: 3600 } } } })
    expect(warning).toContain('cache: { varies: [\'accept\', \'sec-fetch-dest\', \'user-agent\'] }')
    expect(warning).toContain('Keep existing cache options and varies entries.')
    expect(warning).toContain('HTTP Vary alone does not change Nitro\'s cache key.')
    expect(warning).toContain('https://nuxtseo.com/docs/ai-ready/guides/markdown#cache-safety')
    expect(resolveConfigurationWarnings({ ...defaults, routeRules: { '/docs/**': { cache: { maxAge: 3600, varies } } } })).toEqual([])
  })

  it('includes the SSR-independent fix for ISR and unsafe explicit negotiation', () => {
    const [isr] = resolveConfigurationWarnings({ ...defaults, routeRules: { '/docs/**': { isr: true } } })
    expect(isr).toContain('isr: false')
    expect(isr).toContain('use explicit .md URLs')
    const [override] = resolveConfigurationWarnings({ ...defaults, policy: 'enabled', routeRules: { '/docs/**': { cache: true } } })
    expect(override).toContain('aiReady: { contentNegotiation: \'auto\' }')
    expect(override).toContain('cache: { varies: [\'accept\', \'sec-fetch-dest\', \'user-agent\'] }')
  })

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

  it('warns that static output needs deployment negotiation', () => {
    expect(resolveConfigurationWarnings({ ...defaults, static: true })).toEqual([
      expect.stringContaining('Static output cannot run Markdown negotiation middleware'),
    ])
  })
})
