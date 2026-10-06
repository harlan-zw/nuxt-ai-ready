import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

await setup({ rootDir: resolve('../fixtures/private-markdown'), dev: false, server: true })

describe('private markdown', () => {
  it('keeps private HTML private after conversion', async () => {
    const res = await fetch('/private.md')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Private account')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('cdn-cache-control')).toBe('no-store')
  })

  it.each(['cookie', 'authorization'])('does not cache markdown requested with %s', async (header) => {
    const res = await fetch('/about.md', { headers: { [header]: 'session=alice' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('keeps public markdown cacheable', async () => {
    const res = await fetch('/about.md')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('public, max-age=3600')
  })
})
