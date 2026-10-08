import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('optional bot negotiation', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-negotiation-disabled'),
    dev: false,
    server: true,
    nuxtConfig: {
      aiReady: { botNegotiation: true },
      routeRules: {
        '/about': { cache: { maxAge: 3600, varies: ['accept', 'sec-fetch-dest', 'user-agent'] } },
        '/docs/**': { cache: { maxAge: 3600, varies: ['accept'] } },
      },
    },
  })

  it('redirects bot HTML requests only when all cache inputs are covered', async () => {
    const response = await fetch(url('/about'), { headers: { 'Accept': 'text/html', 'User-Agent': 'GPTBot' }, redirect: 'manual' })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/about.md')
    expect(response.headers.get('vary')).toBe('Accept, Sec-Fetch-Dest, User-Agent')
    expect(response.headers.get('cache-control')).toContain('no-store')
    const unsafe = await fetch(url('/docs/getting-started'), { headers: { 'Accept': 'text/html', 'User-Agent': 'GPTBot' }, redirect: 'manual' })
    expect(unsafe.status).toBe(200)
    expect(unsafe.headers.get('content-type')).toContain('text/html')
  })

  it('preserves browser navigation and explicit Markdown rejection for bots', async () => {
    const requests: Record<string, string>[] = [
      { 'Accept': 'text/html', 'User-Agent': 'GPTBot', 'Sec-Fetch-Dest': 'document' },
      { 'Accept': 'text/html, TEXT/MARKDOWN;Q=0', 'User-Agent': 'GPTBot' },
      { 'Accept': 'text/html, text/*;q=0', 'User-Agent': 'GPTBot' },
      { 'Accept': 'text/html, */*;q=0', 'User-Agent': 'GPTBot' },
    ]
    for (const headers of requests) {
      const response = await fetch(url('/about'), { headers, redirect: 'manual' })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(response.headers.get('vary')).toBe('Accept, Sec-Fetch-Dest, User-Agent')
    }
  })

  it('returns an uncacheable 406 instead of overriding unsupported Accept with bot detection', async () => {
    const response = await fetch(url('/about'), { headers: { 'Accept': 'application/x-probe', 'User-Agent': 'GPTBot' } })
    expect(response.status).toBe(406)
    expect(response.headers.get('vary')).toBe('Accept, Sec-Fetch-Dest, User-Agent')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
