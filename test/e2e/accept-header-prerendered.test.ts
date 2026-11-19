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
      routeRules: {
        '/about.md': { headers: { 'vary': 'Origin', 'content-signal': 'search=no', 'x-markdown-rule': 'about' } },
        '/docs/getting-started.md': { proxy: '/api/prerendered-markdown-proxy' },
      },
      nitro: {
        preset: 'node-server',
        prerender: {
          crawlLinks: false,
          routes: ['/', '/about', '/docs/getting-started.md'],
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
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('vary')).toBe('Origin, Accept')
    expect(response.headers.get('link')).toContain('</about>; rel="canonical"')
    expect(response.headers.get('content-signal')).toBe('search=no')
    expect(response.headers.get('x-markdown-rule')).toBe('about')
    expect(await response.text()).toContain('#')
  })

  it('keeps Markdown headers on conditional requests', async () => {
    const request = url('/about.md?source=conditional')
    const initial = await fetch(request, { method: 'HEAD' })
    const etag = initial.headers.get('etag')
    expect(etag).toBeTruthy()
    const response = await fetch(request, { headers: { 'If-None-Match': etag! } })

    expect(response.status).toBe(304)
    expect(response.headers.get('vary')).toBe('Origin, Accept')
    expect(response.headers.get('link')).toContain('</about>; rel="canonical"')
    expect(response.headers.get('content-signal')).toBe('search=no')
  })

  it('serves llms.txt with its prerendered page discovery', async () => {
    const response = await fetch(url('/llms.txt'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('https://test.example.com/about.md')
  })

  it('preserves headers when a route rule proxies a prerendered Markdown URL', async () => {
    const response = await fetch(url('/docs/getting-started.md'))

    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain('</docs/getting-started>; rel="canonical"')
    expect(response.headers.get('vary')).toContain('Accept')
    expect(await response.text()).toBe('# Proxied Markdown')
  })

  it('returns markdown with Accept variation when following homepage negotiation', async () => {
    const response = await fetch(url('/'), { headers: { Accept: 'text/markdown' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(response.headers.get('vary')).toContain('Accept')
    expect(await response.text()).toContain('#')
  })
})
