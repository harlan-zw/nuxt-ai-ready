import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('content negotiation with ISR', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-negotiation-disabled'),
    dev: true,
    server: true,
  })

  it.each([
    ['Accept header', { Accept: 'text/markdown' }],
    ['AI crawler user-agent', { 'User-Agent': 'GPTBot' }],
  ])('keeps the HTML route for %s', async (_, headers) => {
    const response = await fetch(url('/about'), {
      headers,
      redirect: 'manual',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('link')).toContain('/about.md')
  })

  it('keeps explicit Markdown routes', async () => {
    const response = await fetch(url('/about.md'), {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
  })
})
