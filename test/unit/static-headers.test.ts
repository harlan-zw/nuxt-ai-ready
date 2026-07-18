import { describe, expect, it } from 'vitest'
import { ensureStaticHeader } from '../../src/utils/static-headers'

describe('static headers', () => {
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
