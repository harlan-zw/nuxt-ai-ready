import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('i18n enabled by a later module', async () => {
  await setup({
    rootDir: resolve('../fixtures/i18n-late-module'),
    dev: true,
    server: true,
  })

  it('emits hreflang alternates', async () => {
    const response = await fetch(url('/about'), {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(200)
    const link = response.headers.get('link') || ''
    expect(link).toContain('<https://test.example.com/about>; rel="alternate"; hreflang="en"')
    expect(link).toContain('<https://test.example.com/fr/about>; rel="alternate"; hreflang="fr"')
  })
})
