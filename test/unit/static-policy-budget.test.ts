import { describe, expect, it } from 'vitest'
import { enforceStaticHeaderBudget, normalizeStaticContentSignalHeaders } from '../../src/utils/static-headers'
import { resolveCloudflareStaticHeaders } from '../helpers/cloudflare-headers'

describe('static usage policy budget', () => {
  it('rejects mixed policy ordering that changes security headers', () => {
    const source = '/private\n  Content-Signal: ai-train=no\n  ! X-Frame-Options\n/*\n  Content-Signal: ai-train=yes\n  X-Frame-Options: DENY\n'
    expect(() => normalizeStaticContentSignalHeaders(source)).toThrow('Place broader mixed policy rules before narrower rules.')
  })
  it('rejects mixed policy ordering that changes cache headers', () => {
    const source = '/private\n  Content-Signal: ai-train=no\n  Cache-Control: private, no-store\n/*\n  Content-Signal: ai-train=yes\n  ! Cache-Control\n'
    expect(() => normalizeStaticContentSignalHeaders(source)).toThrow('Place broader mixed policy rules before narrower rules.')
  })
  it('moves policy-only rules without changing mixed header precedence', () => {
    const source = '/private\n  Content-Signal: ai-train=no\n/*\n  Content-Signal: ai-train=yes\n  X-Frame-Options: DENY\n/another\n  Cache-Control: no-store\n'
    const result = resolveCloudflareStaticHeaders(normalizeStaticContentSignalHeaders(source), '/private')
    expect(result['x-frame-options']).toBe('DENY')
    expect(result['content-signal']).toBe('ai-train=no')
    expect(resolveCloudflareStaticHeaders(normalizeStaticContentSignalHeaders(source), '/another')['cache-control']).toBe('no-store')
  })
  it('keeps mixed rule order when their policies agree', () => {
    const source = '/private\n  Content-Signal: ai-train=no\n  ! X-Frame-Options\n/*\n  Content-Signal: ai-train=no\n  X-Frame-Options: DENY\n'
    const result = resolveCloudflareStaticHeaders(normalizeStaticContentSignalHeaders(source), '/private')
    expect(result['x-frame-options']).toBe('DENY')
    expect(result['content-signal']).toBe('ai-train=no')
  })
  it('keeps the final unrelated fields of a repeated Cloudflare rule', () => {
    const source = '/*\n  Content-Signal: ai-train=no\n  X-Frame-Options: SAMEORIGIN\n/*\n  X-Frame-Options: DENY\n'
    const result = resolveCloudflareStaticHeaders(normalizeStaticContentSignalHeaders(source), '/private')
    expect(result['x-frame-options']).toBe('DENY')
    expect(result['content-signal']).toBe('ai-train=no')
  })
  it.each([
    ['hsts and Markdown robots', '/*\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n/*.md\n  X-Robots-Tag: noindex, follow\n', '/guide.md'],
    ['public cache and admin privacy', '/guide/*\n  Cache-Control: public, max-age=300, s-maxage=86400\n/admin/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n', '/admin/settings'],
    ['HTML and Markdown cache variation', '/\n  Vary: Accept\n/index.md\n  Content-Type: text/markdown; charset=utf-8\n  Vary: Accept\n', '/index.md'],
    ['private repositories before broad CDN cache', '/api/repos/index/*\n  Cache-Control: private, no-store\n/api/repos/*\n  Cache-Control: public, max-age=3600\n/_nuxt/v2/builds/meta/*\n  Cache-Control: public, max-age=31536000, immutable\n/_nuxt/v2/builds/*\n  Cache-Control: public, max-age=1\n', '/api/repos/index/example'],
    ['Markdown discovery and auth privacy', '/guide.md\n  Link: </guide>; rel=canonical\n/*.md\n  Content-Type: text/markdown; charset=utf-8\n  Vary: Accept\n/auth/*\n  Cache-Control: no-store\n', '/auth/login'],
    ['overlapping security rules', '/private\n  ! X-Frame-Options\n/*\n  X-Frame-Options: DENY\n', '/private'],
  ])('preserves global-policy consumers with %s', (_name, existing, path) => {
    const policy = '  Content-Signal: search=yes, ai-input=yes, ai-train=yes\n'
    const source = /^\/\*\n/m.test(existing) ? existing.replace(/^\/\*\n/m, `/*\n${policy}`) : existing + `/*\n${policy}`
    const expected = resolveCloudflareStaticHeaders(source, path)
    const result = resolveCloudflareStaticHeaders(normalizeStaticContentSignalHeaders(source), path)
    expect(result).toEqual(expected)
  })
  it('preserves a removal when a generated discovery rule repeats its route', () => {
    const headers = normalizeStaticContentSignalHeaders('/notes/removed.md\n  Link: </notes/removed>; rel="canonical"\n/notes/*.md\n  Content-Signal: search=no\n/notes/removed.md\n  ! Content-Signal\n')
    expect(resolveCloudflareStaticHeaders(headers, '/notes/removed.md')['content-signal']).toBeUndefined()
  })
  it('lets specific policies and removals replace a shared static policy', () => {
    const headers = normalizeStaticContentSignalHeaders('/notes/*.md\n  Content-Signal: search=no\n/*\n  Content-Signal: ai-train=no\n/notes/removed.md\n  ! Content-Signal\n')
    expect(resolveCloudflareStaticHeaders(headers, '/notes/one.md')['content-signal']).toBe('search=no')
    expect(resolveCloudflareStaticHeaders(headers, '/notes/removed.md')['content-signal']).toBeUndefined()
    expect(resolveCloudflareStaticHeaders(headers, '/about')['content-signal']).toBe('ai-train=no')
  })
  it('retains a Markdown policy when optional discovery rules are dropped', () => {
    const policy = '/private.md\n  CONTENT-SIGNAL: ai-train=no\n'
    const result = enforceStaticHeaderBudget(`/*\n  X-A: 1\n/public.md\n  Link: </public>; rel="canonical"\n${policy}`, 2)
    expect(result).toEqual({ contents: `/*\n  X-A: 1\n${policy}`, total: 2, dropped: 1 })
  })
})
