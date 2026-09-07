import { describe, expect, it } from 'vitest'
import { isReservedPath, normalizePagePath, toMarkdownPath } from '../../src/runtime/markdown-path'

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

describe('isReservedPath', () => {
  it('matches reserved prefixes as whole path segments', () => {
    expect(isReservedPath('/api')).toBe(true)
    expect(isReservedPath('/api/users')).toBe(true)
    expect(isReservedPath('/_nuxt/app.js')).toBe(true)
    expect(isReservedPath('/@vite/client')).toBe(true)
  })

  it('keeps pages whose first segment only starts with a reserved prefix', () => {
    expect(isReservedPath('/api-reference')).toBe(false)
    expect(isReservedPath('/apiary')).toBe(false)
    expect(isReservedPath('/about')).toBe(false)
  })
})
