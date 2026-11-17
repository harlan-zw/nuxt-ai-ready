import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('serving AI Terms with an app base URL', async () => {
  await setup({ rootDir: resolve('../fixtures/ai-terms-runtime'), build: true, server: true })

  it('serves the origin policy through Nuxt discovery redirects', async () => {
    const response = await fetch(url('/.well-known/ai-terms'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ site: 'https://test.example.com', updated: '2026-11-18' })
  })

  it.each(['/', '/about.md', '/missing-page'])('keeps discovery on runtime responses at %s', async (route) => {
    const response = await fetch(url(route))
    expect(response.headers.get('link')).toContain('<https://test.example.com/docs/.well-known/ai-terms>; rel="ai-terms"')
  })
})
