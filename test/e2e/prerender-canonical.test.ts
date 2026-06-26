import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

// Regression for issue #36: even when the prerender crawler request prefers
// markdown (AI bot UA / Accept: text/markdown), the canonical HTML artifact must
// be a full document, never a meta-refresh redirect stub pointing at the `.md` twin.
describe('prerender canonical HTML (issue #36)', async () => {
  await setup({
    rootDir: resolve('../fixtures/prerender-canonical'),
    build: true,
    server: true,
  })

  it('writes a full HTML document for the index route, not a markdown redirect stub', async () => {
    const html = await $fetch('/', { responseType: 'text' })

    // Full document, not the 95-byte meta-refresh stub
    expect(html).toMatch(/<!DOCTYPE html>/i)
    expect(html).not.toContain('http-equiv="refresh"')
    expect(html).not.toContain('url=/index.md')

    // The real page rendered
    expect(html).toContain('Welcome to Test Site')
  })

  it('writes a full HTML document for a nested route', async () => {
    const html = await $fetch('/about', { responseType: 'text' })

    expect(html).toMatch(/<!DOCTYPE html>/i)
    expect(html).not.toContain('http-equiv="refresh"')
    expect(html).not.toContain('url=/about.md')
  })

  it('still serves the markdown twin at the explicit .md route', async () => {
    const md = await $fetch('/index.md', { responseType: 'text' })

    expect(md).not.toContain('<!DOCTYPE')
    expect(md).not.toContain('http-equiv="refresh"')
    expect(md).toContain('Welcome to Test Site')
  })
})
