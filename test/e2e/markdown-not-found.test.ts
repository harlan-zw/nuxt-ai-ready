import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('markdown not found', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    dev: true,
    server: true,
  })

  // A 200 on a page that does not exist is a soft 404: search engines penalise
  // it, and an agent cannot tell a hit from a miss. The guidance body is the
  // reason the status was 200, and a 404 carries a body perfectly well.
  it('answers a missing page with 404 and keeps the guidance body', async () => {
    const response = await fetch(url('/definitely-not-a-page.md'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('# Page not found')
    expect(body).toContain('/llms.txt')
  })
})
