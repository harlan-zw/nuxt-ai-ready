import { describe, expect, it } from 'vitest'
import { resolveMarkdownRedirect } from '../../src/runtime/server/utils/markdown-redirect'

// The HTML page behind a `/about.md` request.
const page = { pageUrl: 'https://example.com/about' }

describe('resolveMarkdownRedirect', () => {
  it.each([
    ['/new-about', '/new-about.md'],
    ['/new-about/', '/new-about.md'],
    ['/', '/index.md'],
    ['/new?a=1', '/new.md?a=1'],
    ['/new#intro', '/new.md#intro'],
    ['/new/?a=1#intro', '/new.md?a=1#intro'],
    ['team', '/team.md'],
    ['https://example.com/', 'https://example.com/index.md'],
    ['https://example.com/new?a=1', 'https://example.com/new.md?a=1'],
  ])('redirects %s to its markdown sibling %s', (location, expected) => {
    expect(resolveMarkdownRedirect(location, page)).toEqual({ _tag: 'redirect', location: expected })
  })

  it.each([
    'https://other.com/about',
    '//other.com/about',
    'mailto:hi@example.com',
  ])('forwards the cross-origin location %s unchanged', (location) => {
    expect(resolveMarkdownRedirect(location, page)).toEqual({ _tag: 'redirect', location })
  })

  it('treats the site origin as its own origin', () => {
    const result = resolveMarkdownRedirect('https://www.example.com/new', {
      pageUrl: 'http://localhost:3000/about',
      origins: ['https://www.example.com'],
    })
    expect(result).toEqual({ _tag: 'redirect', location: 'https://www.example.com/new.md' })
  })

  it('forwards a target that has no markdown sibling unchanged', () => {
    expect(resolveMarkdownRedirect('/files/report.pdf', page)).toEqual({ _tag: 'redirect', location: '/files/report.pdf' })
  })

  it('follows a trailing-slash redirect instead of redirecting to itself', () => {
    expect(resolveMarkdownRedirect('/about/', page)).toEqual({ _tag: 'follow', path: '/about/' })
    expect(resolveMarkdownRedirect('https://example.com/about/?ref=x', page)).toEqual({ _tag: 'follow', path: '/about/?ref=x' })
  })
})
