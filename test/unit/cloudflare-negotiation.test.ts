import { describe, expect, it } from 'vitest'
import { cloudflareNegotiationPatterns, cloudflarePrerenderedPages, cloudflareStaticFallbackPaths } from '../../src/utils/cloudflare-negotiation'

describe('cloudflare negotiation routing', () => {
  it('selects successful HTML page routes with the deployed base URL', () => {
    const pages = cloudflarePrerenderedPages([
      { route: '/', fileName: '/index.html' },
      { route: '/about/', fileName: '/about/index.html' },
      { route: '/missing', fileName: '/missing.html', error: new Error('not found') },
      { route: '/about.md', fileName: '/about.md' },
      { route: '/api/render', fileName: '/api/render.html' },
    ], '/base/')
    expect(pages).toEqual(['/base', '/base/about'])
  })

  it('adds both page slash variants while preserving unrelated asset routing', () => {
    expect(cloudflareNegotiationPatterns(['/_nuxt/*'], ['/', '/about'])).toEqual(['/_nuxt/*', '/', '/about', '/about/'])
  })

  it('keeps existing wildcards and explicit asset exclusions', () => {
    expect(cloudflareNegotiationPatterns(['/docs/*', '!/private/*'], ['/docs/about', '/private/about', '/'])).toEqual(['/docs/*', '!/private/*', '/'])
  })

  it.each([true, false])('honors explicit worker-first %s', (existing) => {
    expect(cloudflareNegotiationPatterns(existing, ['/'])).toBe(existing)
    expect(cloudflareStaticFallbackPaths(existing, ['/'])).toEqual([])
  })

  it('leaves paths already handled by the Worker behind its application middleware', () => {
    expect(cloudflareStaticFallbackPaths(['/protected', '/private/*'], ['/', '/protected', '/private/page'])).toEqual(['/', '/protected/'])
  })

  it('keeps environment-specific Worker paths behind application middleware', () => {
    expect(cloudflareStaticFallbackPaths(undefined, ['/', '/private/page'], [['/private/*']])).toEqual(['/'])
    expect(cloudflareStaticFallbackPaths(undefined, ['/'], [true])).toEqual([])
  })

  it('requires broader explicit routing when top-level page paths exceed the platform limit', () => {
    const pages = Array.from({ length: 51 }, (_, index) => `/page-${index}`)
    expect(() => cloudflareNegotiationPatterns(undefined, pages)).toThrow('exceeds 100 worker-first patterns')
    expect(cloudflareNegotiationPatterns(['/page-*'], pages)).toEqual(['/page-*'])
  })

  it('routes a directory of pages through one glob when exact paths exceed the platform limit', () => {
    const pages = ['/', '/about', ...Array.from({ length: 60 }, (_, index) => `/docs/page-${index}`)]
    expect(cloudflareNegotiationPatterns(['/_nuxt/*'], pages)).toEqual(['/_nuxt/*', '/', '/about', '/about/', '/docs/*'])
    expect(cloudflareStaticFallbackPaths(['/_nuxt/*'], pages)).toHaveLength(123)
  })

  it('keeps a directory index page exact beside the deepest glob that fits', () => {
    const pages = ['/docs', ...Array.from({ length: 60 }, (_, index) => `/docs/guide/page-${index}`)]
    expect(cloudflareNegotiationPatterns(undefined, pages)).toEqual(['/docs', '/docs/', '/docs/guide/*'])
  })

  it('globs the largest directories first and keeps the rest exact', () => {
    const pages = [
      ...Array.from({ length: 45 }, (_, index) => `/learn/page-${index}`),
      ...Array.from({ length: 4 }, (_, index) => `/tools/tool-${index}`),
      ...Array.from({ length: 3 }, (_, index) => `/guides/guide-${index}`),
    ]
    const patterns = cloudflareNegotiationPatterns(undefined, pages)
    expect(patterns).toContain('/learn/*')
    expect(patterns).toContain('/tools/tool-0/')
    expect(patterns).toContain('/guides/guide-2')
    expect(patterns).toHaveLength(15)
  })

  it('counts existing patterns against the platform limit', () => {
    const existing = Array.from({ length: 99 }, (_, index) => `/manual-${index}`)
    const pages = ['/docs/a', '/docs/b']
    expect(cloudflareNegotiationPatterns(existing, pages)).toEqual([...existing, '/docs/*'])
    expect(() => cloudflareNegotiationPatterns([...existing, '/manual-99'], pages)).toThrow('exceeds 100 worker-first patterns')
  })
})
