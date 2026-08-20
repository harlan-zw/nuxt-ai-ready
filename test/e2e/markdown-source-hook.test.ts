import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('markdown source hook', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/markdown-source', import.meta.url)),
    dev: true,
    server: true,
  })

  it('serves the markdown a site supplies instead of converting its HTML', async () => {
    const response = await fetch(url('/about.md'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('Supplied by the host application')
    // The rendered page's own heading proves conversion did not run.
    expect(body).not.toContain('About this fixture')
  })

  it('converts as usual for a route the hook declines', async () => {
    const response = await fetch(url('/index.md'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).not.toContain('Supplied by the host application')
  })
})
