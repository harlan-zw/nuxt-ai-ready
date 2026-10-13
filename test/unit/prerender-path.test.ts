import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePrerenderRoute, resolvePrerenderFile } from '../../src/prerender-path'

describe('prerender route boundary', () => {
  it.each([
    '/../about',
    '/../../about',
    'https://example.com/../../about',
    '/%2e%2e/about',
    '/%252e%252e/about',
    '/docs%2f..%2fabout',
    '/docs\\..\\about',
    '/docs/%GG',
    '/docs/%00/about',
  ])('rejects unsafe URL %s before fetch normalization', (input) => {
    expect(parsePrerenderRoute(input, '/docs/')).toEqual({ _tag: 'Invalid' })
    expect(() => resolvePrerenderFile('/output/public', input)).toThrow()
  })

  it('preserves encoded names and strips the deployment base exactly once', () => {
    expect(parsePrerenderRoute('https://example.com/docs/caf%C3%A9/', '/docs/')).toEqual({ _tag: 'Valid', route: '/caf%C3%A9' })
    expect(resolvePrerenderFile('/output/public', '/caf%C3%A9.md')).toBe(join('/output/public', 'caf%C3%A9.md'))
  })

  it('preserves encoded literal percent signs without hiding nested traversal', () => {
    expect(parsePrerenderRoute('/discount-100%25', '/')).toEqual({ _tag: 'Valid', route: '/discount-100%25' })
    expect(parsePrerenderRoute('/%25GG', '/')).toEqual({ _tag: 'Valid', route: '/%25GG' })
    expect(parsePrerenderRoute('/%252e%252e/%25GG', '/')).toEqual({ _tag: 'Invalid' })
  })
})
