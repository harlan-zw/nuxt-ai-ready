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
    const link = response.headers.get('link') || ''
    expect(link).toContain('hreflang="en"')
    expect(link).toContain('rel="api-catalog"')
    expect(link.match(/rel="api-catalog"/g)).toHaveLength(1)
  })

  it('keeps hreflang alternates on redirects', async () => {
    const response = await fetch(url('/about'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(307)
    const link = response.headers.get('link') || ''
    expect(link).toContain('hreflang="en"')
    expect(link.match(/rel="api-catalog"/g)).toHaveLength(1)
  })

  it('omits hreflang alternates from error responses', async () => {
    const response = await fetch(url('/en/verktoy/supabase-pwn'), {
      headers: { Accept: 'text/html' },
    })

    expect(response.status).toBe(404)
    const link = response.headers.get('link') || ''
    expect(link).toContain('/en/verktoy/supabase-pwn.md')
    expect(link).not.toContain('hreflang=')
    expect(link).toContain('rel="api-catalog"')
    expect(link.match(/rel="api-catalog"/g)).toHaveLength(1)
  })
})
