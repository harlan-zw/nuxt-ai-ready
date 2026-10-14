import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

await setup({ rootDir: resolve('../fixtures/basic'), dev: true, server: true })

describe('query-dependent Markdown', () => {
  it.each([['week', 'Weekly results'], ['all', 'All-time results'], ['month', 'Monthly results']])('renders the requested %s range', async (range, heading) => {
    const response = await fetch(`/query-page.md?range=${range}`)
    expect(response.status).toBe(200)
    const markdown = await response.text()
    expect(markdown).toContain(heading)
    expect(markdown).toContain(`canonical_url: "https://test.example.com/query-page?range=${range}"`)
    expect(response.headers.get('link')).toContain(`/query-page?range=${range}>; rel="canonical"`)
  })

  it('keeps the query through negotiation and the advertised alternate', async () => {
    const response = await fetch('/query-page?range=week', { headers: { accept: 'text/markdown' }, redirect: 'manual' })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/query-page.md?range=week')
    const html = await fetch('/query-page?range=all', { headers: { accept: 'text/html' } })
    expect(html.headers.get('link')).toContain('/query-page.md?range=all>')
  })

  it('keeps encoded query values in alternate links', async () => {
    const response = await fetch('/query-page.md?range=week&filter=a%26b%3Dc')
    expect(response.headers.get('link')).toContain('/query-page?range=week&filter=a%26b%3Dc>')
    expect(await response.text()).toContain('Weekly results')
  })

  it('redirects when the HTML page changes its query selection', async () => {
    const response = await fetch('/query-page.md?range=week&move=all', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/query-page.md?range=all')
    expect(await (await fetch(response.headers.get('location')!)).text()).toContain('All-time results')
  })
})
