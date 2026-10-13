import { createResolver } from '@nuxt/kit'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

// Nitro passes beforeResponse failures to its error hook and logs nothing.
async function capturedErrors(): Promise<string[]> {
  return $fetch<string[]>('/api/captured-errors')
}

describe('status-aware Link header on responses already sent', async () => {
  await setup({
    rootDir: resolve('../fixtures/link-header-sent'),
    build: true,
    server: true,
  })

  it('leaves a proxied response alone', async () => {
    const response = await fetch(url('/ingest/e'), { headers: { Accept: 'text/html' } })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('proxied body')
    expect(await capturedErrors()).toEqual([])
  })

  it('leaves a 304 from the swr cache alone', async () => {
    const first = await fetch(url('/cached'), { headers: { Accept: 'text/html' } })
    expect(first.status).toBe(200)
    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()

    const revalidated = await fetch(url('/cached'), {
      headers: { 'Accept': 'text/html', 'If-None-Match': etag! },
    })

    expect(revalidated.status).toBe(304)
    expect(await capturedErrors()).toEqual([])
  })

  it('still sends hreflang alternates on a rendered page', async () => {
    const response = await fetch(url('/about'), { headers: { Accept: 'text/html' } })

    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain('hreflang="fr"')
    expect(await capturedErrors()).toEqual([])
  })
})
