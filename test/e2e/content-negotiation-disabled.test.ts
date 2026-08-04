import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('content negotiation with response caching', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-negotiation-disabled'),
    dev: true,
    server: true,
  })

  it.each([
    ['Accept header', { Accept: 'text/markdown' }],
    ['AI crawler user-agent', { 'User-Agent': 'GPTBot' }],
  ])('keeps an inline ISR route as HTML for %s', async (_, headers) => {
    const response = await fetch(url('/isr'), {
      headers,
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('link')).toContain('/isr.md')
    expect(response.headers.get('vary')).toBeNull()
  })

  it('keeps a route cache without negotiation variation as HTML', async () => {
    const response = await fetch(url('/docs/getting-started'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('vary')).toBeNull()
  })

  it('keeps a normalized SWR route as HTML', async () => {
    const response = await fetch(url('/swr'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('vary')).toBeNull()
  })

  it('keeps negotiation while preventing shared caches from storing the redirect', async () => {
    const response = await fetch(url('/'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/index.md')
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Accept, Sec-Fetch-Dest, User-Agent')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
  })

  it('negotiates when the route cache varies on every negotiation input', async () => {
    const markdownResponse = await fetch(url('/about'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })
    const htmlResponse = await fetch(url('/about'), {
      headers: {
        'Accept': 'text/html',
        'Sec-Fetch-Dest': 'document',
      },
      redirect: 'manual',
    })

    expect(markdownResponse.status).toBe(307)
    expect(htmlResponse.status).toBe(200)
    expect(htmlResponse.headers.get('content-type')).toContain('text/html')
    expect(htmlResponse.headers.get('vary')).toBe('Accept, Sec-Fetch-Dest, User-Agent')
  })

  it('keeps explicit Markdown routes on ISR paths', async () => {
    const response = await fetch(url('/isr.md'), {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(response.headers.get('vary')).toBeNull()
  })
})
