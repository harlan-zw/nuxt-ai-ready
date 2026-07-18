import { describe, expect, it } from 'vitest'
import { normalizePagePath, toMarkdownPath } from '../../src/runtime/markdown-path'

describe('normalizePagePath', () => {
  it('uses the same identity for clean and trailing-slash routes', () => {
    expect(normalizePagePath('/about')).toBe('/about')
    expect(normalizePagePath('/about/')).toBe('/about')
    expect(normalizePagePath('/docs/getting-started///')).toBe('/docs/getting-started')
  })

  it('preserves the root route', () => {
    expect(normalizePagePath('/')).toBe('/')
  })
})

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
