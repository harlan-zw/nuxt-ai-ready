import { createResolver } from '@nuxt/kit'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('webmcp', async () => {
  await setup({
    rootDir: resolve('../fixtures/webmcp'),
    build: true,
    server: true,
  })

  it('lists pages for the site tools', async () => {
    const res = await $fetch('/__ai-ready/pages') as any

    expect(res).toMatchObject({ limit: 20, offset: 0 })
    expect(Array.isArray(res.pages)).toBe(true)
    expect(typeof res.total).toBe('number')
    expect(typeof res.hasMore).toBe('boolean')
  })

  it('clamps the page limit', async () => {
    const res = await $fetch('/__ai-ready/pages?limit=500') as any
    expect(res.limit).toBe(50)
  })

  it('checks whether an exact route is indexed', async () => {
    const res = await $fetch('/__ai-ready/pages?route=/definitely-not-indexed') as any
    expect(res).toEqual({ page: null })
  })

  it('returns search results for a query', async () => {
    const res = await $fetch('/__ai-ready/pages?q=getting+started') as any

    expect(res.query).toBe('getting started')
    expect(Array.isArray(res.results)).toBe(true)
  })

  it('serves the page index with cache headers', async () => {
    const response = await fetch('/__ai-ready/pages')
    expect(response.headers.get('cache-control')).toContain('max-age=')
  })

  it('exposes the webmcp options to the browser', async () => {
    const html = await $fetch('/') as string

    expect(html).toContain('maxOutputChars')
    expect(html).toContain('500')
  })
})
