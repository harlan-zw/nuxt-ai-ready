import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('accept header content negotiation', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    dev: true,
    server: true,
  })

  describe('explicit .md extension', () => {
    it('serves markdown for .md routes regardless of Accept header', async () => {
      const response = await fetch(url('/index.md'), {
        headers: {
          Accept: 'text/html',
        },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/markdown')

      const content = await response.text()
      expect(content).toContain('#')
    })

    it('serves markdown with proper charset', async () => {
      const response = await fetch(url('/about.md'))

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/markdown')
      expect(response.headers.get('content-type')).toContain('charset=utf-8')
    })
  })

  describe('content negotiation without .md extension', () => {
    it('serves HTML to browsers (sec-fetch-dest: document)', async () => {
      const response = await fetch(url('/about'), {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'sec-fetch-dest': 'document',
        },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/html')
    })

    it('serves HTML when Accept includes text/html', async () => {
      const response = await fetch(url('/about'), {
        headers: {
          Accept: 'text/html,*/*',
        },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/html')
    })

    it('serves markdown for API clients with */*, no text/html', async () => {
      const response = await fetch(url('/about'), {
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/markdown')
    })

    it('serves markdown when Accept is text/markdown', async () => {
      const response = await fetch(url('/about'), {
        headers: {
          Accept: 'text/markdown',
        },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/markdown')
    })
  })

  describe('error handling', () => {
    it('returns 404 for non-existent .md route', async () => {
      const response = await fetch(url('/non-existent-page.md'))

      expect(response.status).toBe(404)
    })
  })
})
