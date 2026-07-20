import { describe, expect, it } from 'vitest'
import { normalizePersistedRoute, toDeployedRoute, toLogicalRoute } from '../../src/runtime/route-path'

describe('app base route paths', () => {
  it('normalizes deployed sitemap URLs and trailing slashes', () => {
    expect(toLogicalRoute('https://example.com/docs/about/', '/docs/')).toBe('/about')
    expect(toLogicalRoute('/docs/docs/api/', '/docs/')).toBe('/docs/api')
  })

  it('applies the deployment base without collapsing matching route segments', () => {
    expect(toDeployedRoute('/about', '/docs/')).toBe('/docs/about')
    expect(toDeployedRoute('/docs/api', '/docs/')).toBe('/docs/docs/api')
  })

  it('disambiguates legacy deployed rows with sitemap evidence', () => {
    const sitemapRoutes = new Set(['/about', '/docs/api'])

    expect(normalizePersistedRoute('/docs/about', sitemapRoutes, '/docs/')).toBe('/about')
    expect(normalizePersistedRoute('/docs/api', sitemapRoutes, '/docs/')).toBe('/docs/api')
  })
})
