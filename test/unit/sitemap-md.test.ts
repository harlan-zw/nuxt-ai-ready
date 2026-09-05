import { describe, expect, it } from 'vitest'
import { appendSitemapSection, buildSitemapMd, isSitemapMdRequest, SITEMAP_MD_ROUTE } from '../../src/runtime/server/utils/sitemap-md'

describe('buildSitemapMd', () => {
  it('groups pages by top-level path segment with .md links', () => {
    const md = buildSitemapMd([
      { route: '/docs/getting-started', title: 'Getting Started' },
      { route: '/about', title: 'About' },
      { route: '/docs/api', title: 'API' },
    ])

    expect(md).toContain('## docs')
    expect(md).toContain('- [Getting Started](/docs/getting-started.md)')
    expect(md).toContain('- [API](/docs/api.md)')
    expect(md).toContain('## about')
    expect(md).toContain('- [About](/about.md)')
    expect(md.indexOf('## about')).toBeLessThan(md.indexOf('## docs'))
  })

  it('puts root pages in a leading Root section', () => {
    const md = buildSitemapMd([
      { route: '/docs/api', title: 'API' },
      { route: '/', title: 'Home' },
    ])

    expect(md).toContain('## Root')
    expect(md).toContain('- [Home](/index.md)')
    expect(md.indexOf('## Root')).toBeLessThan(md.indexOf('## docs'))
  })

  it('falls back to the route as link text and escapes brackets in titles', () => {
    const md = buildSitemapMd([
      { route: '/guides', title: '[WIP] Guides' },
      { route: '/no-title' },
    ])

    expect(md).toContain('- [\\[WIP\\] Guides](/guides.md)')
    expect(md).toContain('- [/no-title](/no-title.md)')
  })

  it('adds lastmod as link title text when updatedAt parses', () => {
    const md = buildSitemapMd([
      { route: '/docs/api', title: 'API', updatedAt: '2026-01-02T03:04:05.000Z' },
      { route: '/docs/guide', title: 'Guide', updatedAt: 'not-a-date' },
    ])

    expect(md).toContain('- [API](/docs/api.md "2026-01-02T03:04:05.000Z")')
    expect(md).toContain('- [Guide](/docs/guide.md)')
  })

  it('respects a custom href resolver and site name', () => {
    const md = buildSitemapMd(
      [{ route: '/about', title: 'About' }],
      { siteName: 'Example', resolveHref: route => `/base${route}.md` },
    )

    expect(md).toContain('# Example Sitemap')
    expect(md).toContain('- [About](/base/about.md)')
  })

  it('ends with a newline and renders no sections without pages', () => {
    const md = buildSitemapMd([])

    expect(md.endsWith('\n')).toBe(true)
    expect(md).not.toContain('## ')
  })
})

describe('appendSitemapSection', () => {
  it('appends the section with the default href', () => {
    const result = appendSitemapSection('# Title\n\nBody')

    expect(result).toBe(`# Title\n\nBody\n\n## Sitemap\n\nSee the full [sitemap](${SITEMAP_MD_ROUTE}) for all pages.\n`)
  })

  it('respects a custom sitemap href', () => {
    const result = appendSitemapSection('Body', '/base/sitemap.md')

    expect(result).toContain('See the full [sitemap](/base/sitemap.md) for all pages.')
  })

  it('does not append twice when the section already ends the page', () => {
    const once = appendSitemapSection('Body')
    const twice = appendSitemapSection(once)

    expect(twice).toBe(once)
  })

  it('keeps the section when the page quotes it mid-document', () => {
    const doc = `Intro\n\n## Sitemap\n\nSee the full [sitemap](${SITEMAP_MD_ROUTE}) for all pages.\n\nExplanation follows.`
    const result = appendSitemapSection(doc)

    expect(result.match(/## Sitemap/g)).toHaveLength(2)
  })
})

describe('isSitemapMdRequest', () => {
  it('matches the reserved route with and without a base URL', () => {
    expect(isSitemapMdRequest('/sitemap.md', '/', true)).toBe(true)
    expect(isSitemapMdRequest('/base/sitemap.md', '/base', true)).toBe(true)
    expect(isSitemapMdRequest('/sitemap.md?probe=1', '/', true)).toBe(true)
  })

  it('rejects other markdown routes, nested namesakes, and disabled config', () => {
    expect(isSitemapMdRequest('/docs/sitemap.md', '/', true)).toBe(false)
    expect(isSitemapMdRequest('/about.md', '/', true)).toBe(false)
    expect(isSitemapMdRequest('/base/sitemap.md', '/other', true)).toBe(false)
    expect(isSitemapMdRequest('/sitemap.md', '/', false)).toBe(false)
  })
})
