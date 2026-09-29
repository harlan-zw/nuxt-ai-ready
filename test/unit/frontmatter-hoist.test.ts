import { describe, expect, it } from 'vitest'
import { hoistMetaDescription } from '../../src/runtime/server/utils/frontmatter'

describe('hoistMetaDescription', () => {
  it('moves the description to the root after the title and keeps other meta fields', () => {
    const markdown = '---\ntitle: About\ncanonical_url: "https://x.com/about"\nmeta:\n  author: Me\n  description: "About us"\n---\n\n# About\n'

    expect(hoistMetaDescription(markdown)).toBe(
      '---\ntitle: About\ndescription: "About us"\ncanonical_url: "https://x.com/about"\nmeta:\n  author: Me\n---\n\n# About\n',
    )
  })

  it('drops an emptied meta block', () => {
    const markdown = '---\ntitle: About\nmeta:\n  description: "About us"\n---\n\n# About\n'

    expect(hoistMetaDescription(markdown)).toBe('---\ntitle: About\ndescription: "About us"\n---\n\n# About\n')
  })

  it('leaves Markdown without a meta description unchanged', () => {
    const markdown = '---\ntitle: About\n---\n\n# About\n'

    expect(hoistMetaDescription(markdown)).toBe(markdown)
  })
})
