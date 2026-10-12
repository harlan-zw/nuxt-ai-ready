import { describe, expect, it } from 'vitest'
import { enforceStaticHeaderBudget, ensureStaticHeader, mergeStaticDiscoveryHeaders } from '../../src/utils/static-headers'

describe('static headers', () => {
  it('consolidates shared rules while preserving user and generated headers', () => {
    const contents = '/*\n  X-User: previous\n  Link: </style.css>; rel="preload"\n/*\n  X-User: keep\n  X-Generated: keep\n  Link: </catalog>; rel="api-catalog"\n'
    const merged = mergeStaticDiscoveryHeaders(contents, '/', ['</llms.txt>; rel="describedby"', '</catalog>; rel="api-catalog"'])
    expect(merged.match(/^\/\*$/gm)).toHaveLength(1)
    expect(merged).toContain('X-User: keep')
    expect(merged).not.toContain('X-User: previous')
    expect(merged).toContain('X-Generated: keep')
    expect(merged).toContain('Link: </style.css>; rel="preload", </catalog>; rel="api-catalog", </llms.txt>; rel="describedby"')
  })

  it('honors shared Link removal across duplicate rules', () => {
    const contents = '/*\n  ! Link\n/*\n  Link: </catalog>; rel="api-catalog"\n'
    const merged = mergeStaticDiscoveryHeaders(contents, '/', ['</llms.txt>; rel="describedby"'])
    expect(merged).toContain('! Link')
    expect(merged).not.toContain('rel="describedby"')
  })
  it('uses one shared discovery rule with thousands of page twins', () => {
    const contents = Array.from({ length: 1000 }, (_, i) => `/page-${i}.md\n  Content-Type: text/markdown\n`).join('')
    const merged = mergeStaticDiscoveryHeaders(contents, '/base/', ['</base/llms.txt>; rel="describedby"'])
    const result = enforceStaticHeaderBudget(merged, 100)
    expect(result.total).toBe(1)
    expect(result.contents).toBe('/base/*\n  Link: </base/llms.txt>; rel="describedby"\n')
  })

  it('adds no rule when no discovery artifact is available', () => {
    const contents = '/*\n  X-Test: preserved\n'
    expect(mergeStaticDiscoveryHeaders(contents, '/', [])).toBe(contents)
  })
  it('appends discovery links without changing quoted user Link values', () => {
    const contents = '/*\n  Link: </Styles.css>; rel="preload"; title="First,Second"\n'
    const entry = '</llms.txt>; rel="describedby"'
    const result = ensureStaticHeader(contents, '/*', 'Link', entry, 'append')
    expect(result).toBe('/*\n  Link: </Styles.css>; rel="preload"; title="First,Second", </llms.txt>; rel="describedby"\n')
    expect(ensureStaticHeader(result, '/*', 'Link', entry, 'append')).toBe(result)
  })

  it('preserves explicit discovery Link removal', () => {
    const contents = '/*\n  ! Link\n'
    expect(ensureStaticHeader(contents, '/*', 'Link', '</llms.txt>; rel="describedby"', 'append')).toBe(contents)
  })
  it.each([
    ['Origin', 'Origin, Accept'],
    ['accept, Origin', 'accept, Origin'],
    ['*', '*'],
  ])('adds Accept while preserving a static Vary value of %s', (current, expected) => {
    const contents = `/*.md\n  Vary: ${current}\n`
    expect(ensureStaticHeader(contents, '/*.md', 'Vary', 'Accept', 'append')).toBe(`/*.md\n  Vary: ${expected}\n`)
  })

  it('preserves an explicit Vary removal', () => {
    const contents = '/*.md\n  ! Vary\n'
    expect(ensureStaticHeader(contents, '/*.md', 'Vary', 'Accept', 'append')).toBe(contents)
  })

  it('honors Vary removal even when the block also declares a value', () => {
    const contents = '/*.md\n  Vary: Origin\n  ! Vary\n'
    expect(ensureStaticHeader(contents, '/*.md', 'Vary', 'Accept', 'append')).toBe(contents)
  })

  it('adds a route block when none exists', () => {
    expect(ensureStaticHeader('', '/*.md', 'Content-Type', 'text/markdown')).toBe([
      '/*.md',
      '  Content-Type: text/markdown',
      '',
    ].join('\n'))
  })

  it('merges a header into an existing route block', () => {
    const headers = [
      '/*.md',
      '  X-Robots-Tag: noindex',
      '/llms.txt',
      '  Content-Type: text/plain',
      '',
    ].join('\n')

    const result = ensureStaticHeader(headers, '/*.md', 'Content-Type', 'text/markdown')
    expect(result.match(/^\/\*\.md$/gm)).toHaveLength(1)
    expect(result).toContain([
      '/*.md',
      '  Content-Type: text/markdown',
      '  X-Robots-Tag: noindex',
    ].join('\n'))
  })

  it('preserves an existing header value', () => {
    const headers = [
      '/*.md',
      '  content-type: application/markdown',
      '',
    ].join('\n')

    expect(ensureStaticHeader(headers, '/*.md', 'Content-Type', 'text/markdown')).toBe(headers)
  })

  it('preserves an explicit header removal', () => {
    const headers = [
      '/*.md',
      '  ! Content-Type',
      '',
    ].join('\n')

    expect(ensureStaticHeader(headers, '/*.md', 'Content-Type', 'text/markdown')).toBe(headers)
  })

  it('preserves CRLF line endings', () => {
    const headers = '/*.md\r\n  X-Robots-Tag: noindex\r\n'
    expect(ensureStaticHeader(headers, '/*.md', 'Content-Type', 'text/markdown')).toBe(
      '/*.md\r\n  Content-Type: text/markdown\r\n  X-Robots-Tag: noindex\r\n',
    )
  })
})
