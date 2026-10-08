import { describe, expect, it } from 'vitest'
import { ensureStaticHeader } from '../../src/utils/static-headers'

describe('static headers', () => {
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
