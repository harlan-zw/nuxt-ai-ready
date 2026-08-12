import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('i18n error response headers', async () => {
  await setup({
    rootDir: resolve('../fixtures/i18n-error-headers'),
    dev: true,
    server: true,
  })

  it('emits hreflang alternates for successful responses', async () => {
    const response = await fetch(url('/about'), {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain('hreflang="en"')
  })

  it('omits hreflang alternates from error responses', async () => {
    const response = await fetch(url('/en/verktoy/supabase-pwn'), {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(404)
    const link = response.headers.get('link')
    expect(link).toContain('/en/verktoy/supabase-pwn.md')
    expect(link).not.toContain('hreflang=')
  })
})
