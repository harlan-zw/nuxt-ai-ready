import { describe, expect, it } from 'vitest'
import { absoluteMarkdownLinks } from '../../src/runtime/markdown-links'

const origin = 'https://example.com'

describe('absoluteMarkdownLinks', () => {
  it('resolves root-relative inline links and images against the origin', () => {
    expect(absoluteMarkdownLinks('See [the API](/docs/api) and ![logo](/logo.png "Logo").', origin))
      .toBe('See [the API](https://example.com/docs/api) and ![logo](https://example.com/logo.png "Logo").')
  })

  it('resolves angle-bracket destinations and reference definitions', () => {
    expect(absoluteMarkdownLinks('[a](</docs/a b>)\n\n[ref]: /docs/ref "Ref"\n  [two]: </docs/two>', origin))
      .toBe('[a](<https://example.com/docs/a b>)\n\n[ref]: https://example.com/docs/ref "Ref"\n  [two]: <https://example.com/docs/two>')
  })

  it('keeps links that already work without the page URL', () => {
    const markdown = '[abs](https://other.dev/x) [proto](//cdn.dev/x) [frag](#install) [mail](mailto:a@b.co) [rel](guide)'
    expect(absoluteMarkdownLinks(markdown, origin)).toBe(markdown)
  })

  it('leaves code untouched', () => {
    const markdown = [
      'Use `[x](/inline)` in text.',
      '',
      '```md',
      '[fenced](/docs/fenced)',
      '```',
      '',
      '~~~~',
      '[tilde](/docs/tilde)',
      '```',
      '[still code](/docs/still)',
      '~~~~',
      '',
      '[after](/docs/after)',
    ].join('\n')
    expect(absoluteMarkdownLinks(markdown, origin)).toBe(markdown.replace('(/docs/after)', '(https://example.com/docs/after)'))
  })

  it('matches code spans by backtick run length', () => {
    expect(absoluteMarkdownLinks('A `` [a](/a) ` [b](/b) `` then [c](/c), and a lone ` before [d](/d).', origin))
      .toBe('A `` [a](/a) ` [b](/b) `` then [c](https://example.com/c), and a lone ` before [d](https://example.com/d).')
  })

  it('drops a path on the origin and keeps a base path out of it', () => {
    expect(absoluteMarkdownLinks('[a](/a)', 'https://example.com/docs/page')).toBe('[a](https://example.com/a)')
  })
})
