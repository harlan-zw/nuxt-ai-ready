import { describe, expect, it } from 'vitest'
import { buildStaticMarkdownLinkHeader, isStaticMarkdownSourceRoute, staticDescribedbyEntry } from '../../src/utils/static-markdown-headers'

describe('buildStaticMarkdownLinkHeader', () => {
  it('emits relative canonical and describedby entries for a page route', () => {
    expect(buildStaticMarkdownLinkHeader('/about', '/', true)).toBe(
      '</about>; rel="alternate"; type="text/html", </about>; rel="canonical", </llms.txt>; rel="describedby"',
    )
  })

  it('omits describedby when disabled', () => {
    expect(buildStaticMarkdownLinkHeader('/about', '/', false)).toBe(
      '</about>; rel="alternate"; type="text/html", </about>; rel="canonical"',
    )
  })

  it('normalizes trailing slashes and applies the base URL', () => {
    expect(buildStaticMarkdownLinkHeader('/about/', '/base', true)).toContain('</base/about>; rel="canonical"')
    expect(buildStaticMarkdownLinkHeader('/about/', '/base', true)).toContain('</base/llms.txt>; rel="describedby"')
  })

  it('points the root page canonical at the deployed root', () => {
    expect(buildStaticMarkdownLinkHeader('/', '/', true)).toContain('</>; rel="canonical"')
    expect(buildStaticMarkdownLinkHeader('/', '/', true)).toContain('</llms.txt>; rel="describedby"')
  })

  it('percent-encodes non-Latin paths so the header stays ASCII', () => {
    const header = buildStaticMarkdownLinkHeader('/中文', '/', true)
    expect(header).toContain('rel="canonical"')
    expect([...header].every(ch => ch.charCodeAt(0) <= 127)).toBe(true)
  })
})

describe('staticDescribedbyEntry', () => {
  it('applies the base URL to llms.txt', () => {
    expect(staticDescribedbyEntry('/base')).toBe('</base/llms.txt>; rel="describedby"')
  })
})

describe('isStaticMarkdownSourceRoute', () => {
  it('accepts page routes, including the root and trailing slashes', () => {
    expect(isStaticMarkdownSourceRoute('/')).toBe(true)
    expect(isStaticMarkdownSourceRoute('/about')).toBe(true)
    expect(isStaticMarkdownSourceRoute('/about/')).toBe(true)
    expect(isStaticMarkdownSourceRoute('/docs/getting-started')).toBe(true)
  })

  it('rejects patterns, dynamic params, non-page files, and internal prefixes', () => {
    expect(isStaticMarkdownSourceRoute('/docs/**')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/users/:id')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/sitemap.xml')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/robots.txt')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/index.md')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/api/data')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/_content')).toBe(false)
    expect(isStaticMarkdownSourceRoute('/@build')).toBe(false)
  })
})
