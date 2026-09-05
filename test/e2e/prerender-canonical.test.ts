import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { fetch, url } from '@nuxt/test-utils/e2e'
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

  it('emits canonical and describedby Link headers on the prerendered markdown twin', async () => {
    const response = await fetch(url('/about.md'))

    expect(response.status).toBe(200)
    // last-modified proves Nitro's static handler answers, which is the path
    // that never runs the negotiation middleware (#82).
    expect(response.headers.get('last-modified')).toBeTruthy()
    const link = response.headers.get('link') || ''
    expect(link).toContain('</about>; rel="canonical"')
    expect(link).toContain('</llms.txt>; rel="describedby"')
  })

  it('emits the same Link headers on a twin discovered only by crawling', async () => {
    // /crawled is linked from the index page but absent from
    // nitro.prerender.routes, so only the crawler can have prerendered it.
    const response = await fetch(url('/crawled.md'))

    expect(response.status).toBe(200)
    expect(response.headers.get('last-modified')).toBeTruthy()
    const link = response.headers.get('link') || ''
    expect(link).toContain('</crawled>; rel="canonical"')
    expect(link).toContain('</crawled>; rel="alternate"; type="text/html"')
    expect(link).toContain('</llms.txt>; rel="describedby"')
  })
})
