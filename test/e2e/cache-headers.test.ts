import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('cache headers', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    dev: true,
    server: true,
  })

  describe('runtime llms.txt', () => {
    it('serves llms.txt with correct content-type', async () => {
      const response = await fetch(url('/llms.txt'))
      const contentType = response.headers.get('content-type')

      expect(contentType).toContain('text/plain')
    })
  })

  describe('runtime markdown', () => {
    it('serves .md files with markdown content-type', async () => {
      const response = await fetch(url('/index.md'), {
        headers: { Accept: 'text/markdown, */*' },
      })
      const contentType = response.headers.get('content-type')

      expect(contentType).toContain('text/markdown')
      expect(contentType).toContain('charset=utf-8')
    })

    it('includes cache-control header with max-age and swr', async () => {
      const response = await fetch(url('/about.md'), {
        headers: { Accept: 'text/markdown, */*' },
      })
      const cacheControl = response.headers.get('cache-control')

      expect(cacheControl).toBeTruthy()
      // Default maxAge is 3600 (1 hour) with swr enabled
      expect(cacheControl).toContain('max-age=')
      expect(cacheControl).toContain('stale-while-revalidate')
    })

    it('uses public cache directive', async () => {
      const response = await fetch(url('/index.md'), {
        headers: { Accept: 'text/markdown, */*' },
      })
      const cacheControl = response.headers.get('cache-control')

      expect(cacheControl).toContain('public')
    })
  })
})
