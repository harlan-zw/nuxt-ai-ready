import { fileURLToPath } from 'node:url'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('markdown redirects', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    dev: true,
    server: true,
  })

  it.each([
    ['/go-home.md', '/index.md'],
    ['/moved-about.md', '/about.md?from=moved#top'],
    ['/elsewhere.md', 'https://other.example.org/page'],
  ])('redirects %s to %s', async (path, location) => {
    const response = await fetch(path, { redirect: 'manual' })
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe(location)
  })

  it('serves markdown when the page redirects to its trailing-slash URL', async () => {
    const response = await fetch('/@slash.md', { redirect: 'manual' })
    expect(response.status).toBe(200)
    const markdown = await response.text()
    expect(markdown).toContain('@slash')
    expect(markdown).not.toContain('<!DOCTYPE html>')
  })
})
