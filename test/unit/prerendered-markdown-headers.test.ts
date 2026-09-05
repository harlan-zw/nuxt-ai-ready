import { describe, expect, it } from 'vitest'
import { prerenderedMarkdownHeaderRules } from '../../src/utils/static-markdown-headers'

describe('prerenderedMarkdownHeaderRules', () => {
  it('builds an exact rule for a crawled-only markdown twin', () => {
    const rules = prerenderedMarkdownHeaderRules(
      [
        { route: '/crawled', fileName: '/crawled/index.html' },
        { route: '/crawled.md', fileName: '/crawled.md' },
        { route: '/llms.txt', fileName: '/llms.txt' },
      ],
      '/',
      true,
    )

    expect(rules).toHaveLength(1)
    expect(rules[0]!.route).toBe('/crawled.md')
    expect(rules[0]!.headers['Content-Type']).toBe('text/markdown; charset=utf-8')
    expect(rules[0]!.headers.Link).toContain('</crawled>; rel="alternate"; type="text/html"')
    expect(rules[0]!.headers.Link).toContain('</crawled>; rel="canonical"')
    expect(rules[0]!.headers.Link).toContain('</llms.txt>; rel="describedby"')
  })

  it('maps the index twin to the root canonical and applies the base URL', () => {
    const rules = prerenderedMarkdownHeaderRules(
      [{ route: '/base/index.md', fileName: '/index.md' }],
      '/base',
      true,
    )

    expect(rules[0]!.route).toBe('/index.md')
    expect(rules[0]!.headers.Link).toContain('</base>; rel="canonical"')
    expect(rules[0]!.headers.Link).toContain('</base/llms.txt>; rel="describedby"')
  })

  it('skips non-twin entries and deduplicates twins', () => {
    const rules = prerenderedMarkdownHeaderRules(
      [
        { route: '/', fileName: '/index.html' },
        { route: '/404.html', fileName: '/404.html' },
        { route: '/sitemap.md', fileName: '/sitemap.md' },
        { route: '/api/data.md', fileName: '/api/data.md' },
        { route: '/a.md', fileName: '/a.md' },
        { route: '/a.md', fileName: '/a.md' },
      ],
      '/',
      true,
    )

    expect(rules.map(rule => rule.route)).toEqual(['/a.md'])
  })

  it('omits describedby when disabled', () => {
    const rules = prerenderedMarkdownHeaderRules(
      [{ route: '/a.md', fileName: '/a.md' }],
      '/',
      false,
    )

    expect(rules[0]!.headers.Link).not.toContain('describedby')
  })

  it('returns no rules when nothing markdown-backed was prerendered', () => {
    expect(prerenderedMarkdownHeaderRules([], '/', true)).toEqual([])
  })
})
