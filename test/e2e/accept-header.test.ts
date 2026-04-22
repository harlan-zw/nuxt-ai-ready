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
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'ClaudeCode',
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

  describe('q-value handling', () => {
    it('serves HTML when html q > markdown q', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html;q=1.0, text/markdown;q=0.5' },
      })

      expect(response.headers.get('content-type')).toContain('text/html')
    })

    it('serves markdown when markdown q > html q', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html;q=0.5, text/markdown;q=1.0' },
      })

      expect(response.headers.get('content-type')).toContain('text/markdown')
    })

    it('rejects markdown when q=0 and serves HTML', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html, text/markdown;q=0' },
      })

      expect(response.headers.get('content-type')).toContain('text/html')
    })
  })

  describe('vary and link headers', () => {
    it('sets Vary: Accept on markdown response', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/markdown' },
      })

      const vary = response.headers.get('vary') || ''
      expect(vary.toLowerCase()).toContain('accept')
    })

    it('sets Vary: Accept on HTML response for negotiable routes', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html' },
      })

      const vary = response.headers.get('vary') || ''
      expect(vary.toLowerCase()).toContain('accept')
    })

    it('advertises markdown alternate via Link header on HTML', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html' },
      })

      const link = response.headers.get('link') || ''
      expect(link).toContain('/about.md')
      expect(link).toContain('rel="alternate"')
      expect(link).toContain('type="text/markdown"')
    })

    it('advertises HTML alternate via Link header on markdown', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/markdown' },
      })

      const link = response.headers.get('link') || ''
      expect(link).toContain('/about')
      expect(link).toContain('rel="alternate"')
      expect(link).toContain('type="text/html"')
    })
  })

  describe('406 Not Acceptable', () => {
    it('returns 406 for unsupported media type', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'application/x-content-negotiation-probe' },
      })

      expect(response.status).toBe(406)
    })

    it('returns 406 when all supported types have q=0', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html;q=0, text/markdown;q=0, text/plain;q=0' },
      })

      expect(response.status).toBe(406)
    })

    it('does not 406 when wildcard accepts everything', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: '*/*' },
      })

      expect(response.status).not.toBe(406)
    })
  })

  describe('error handling', () => {
    it('returns 404 for non-existent .md route', async () => {
      const response = await fetch(url('/non-existent-page.md'))

      expect(response.status).toBe(404)
    })
  })
})
