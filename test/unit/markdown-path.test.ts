import { describe, expect, it } from 'vitest'
import { isReservedPath, markdownAlternatePath, normalizePagePath, toMarkdownPath } from '../../src/runtime/markdown-path'

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

  it('reserves only the Vite internals under @, not an @handle namespace', () => {
    // Vite serves these, and only in dev.
    expect(isReservedPath('/@vite/client')).toBe(true)
    expect(isReservedPath('/@vite/env')).toBe(true)
    expect(isReservedPath('/@id/virtual:module')).toBe(true)
    expect(isReservedPath('/@fs/home/user/project/file.js')).toBe(true)
    expect(isReservedPath('/@react-refresh')).toBe(true)

    // A site whose profile routes are /@login owns these.
    expect(isReservedPath('/@emilkowalski')).toBe(false)
    expect(isReservedPath('/@harlan-zw/nuxt')).toBe(false)
    expect(isReservedPath('/@vitest')).toBe(false)
    expect(isReservedPath('/@idris')).toBe(false)
    expect(isReservedPath('/@fsociety')).toBe(false)
  })
})

describe('markdownAlternatePath', () => {
  it('names the sibling a page may advertise', () => {
    expect(markdownAlternatePath('/')).toBe('/index.md')
    expect(markdownAlternatePath('/about')).toBe('/about.md')
    expect(markdownAlternatePath('/@emilkowalski')).toBe('/@emilkowalski.md')
  })

  it('advertises nothing the markdown handler would decline', () => {
    // The handler skips these, so a page must not link them: the link would
    // resolve to the HTML shell or a 404 instead of markdown.
    expect(markdownAlternatePath('/api/users')).toBeNull()
    expect(markdownAlternatePath('/_nuxt/app.js')).toBeNull()
    expect(markdownAlternatePath('/@vite/client')).toBeNull()
    expect(markdownAlternatePath('/sitemap.xml')).toBeNull()
  })
})
