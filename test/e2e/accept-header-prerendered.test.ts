import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

// Regression for issue #82. Nitro unshifts its static asset handler in front of
// every server middleware when serveStatic is on, which the node-server preset
// turns on. Accept negotiation must still run for a prerendered route.
describe('accept header negotiation for prerendered routes', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    nuxtConfig: {
      nitro: {
        preset: 'node-server',
        prerender: {
          crawlLinks: false,
          routes: ['/', '/about'],
          failOnError: false,
        },
      },
    },
  })

  it('serves the prerendered HTML from the static handler', async () => {
    const response = await fetch(url('/about'), {
      headers: { 'Accept': 'text/html', 'Sec-Fetch-Dest': 'document' },
    })

    expect(response.status).toBe(200)
    // Only the static asset handler sets last-modified. It proves the route is
    // answered from the prerendered file, not from a server render.
    expect(response.headers.get('last-modified')).toBeTruthy()
    expect(response.headers.get('vary')).toContain('Accept')
    expect(response.headers.get('link')).toContain('rel="alternate"')
  })

  it('redirects a markdown client to the prerendered .md twin', async () => {
    const response = await fetch(url('/about'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/about.md')
    expect(response.headers.get('vary')).toContain('Accept')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('redirects the prerendered root path', async () => {
    const response = await fetch(url('/'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/index.md')
  })

  it('still serves the prerendered markdown twin', async () => {
    const response = await fetch(url('/about.md'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(await response.text()).toContain('#')
  })
})
