import { describe, expect, it } from 'vitest'
import { toMarkdownPath } from '../../src/runtime/markdown-path'

describe('toMarkdownPath', () => {
  it('keeps root at /index.md', () => {
    expect(toMarkdownPath('/')).toBe('/index.md')
  })

  it('maps clean routes to sibling .md files', () => {
    expect(toMarkdownPath('/about')).toBe('/about.md')
    expect(toMarkdownPath('/docs/getting-started')).toBe('/docs/getting-started.md')
  })

  it('maps trailing-slash routes to sibling .md files', () => {
    expect(toMarkdownPath('/about/')).toBe('/about.md')
    expect(toMarkdownPath('/docs/getting-started/')).toBe('/docs/getting-started.md')
  })
})
