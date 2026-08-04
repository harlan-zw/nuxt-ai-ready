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

  describe('redirect to .md', () => {
    it('returns 307 redirect to .md when Accept is text/markdown', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/markdown' },
        redirect: 'manual',
      })

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('/about.md')
    })

    it('redirects root path to /index.md', async () => {
      const response = await fetch(url('/'), {
        headers: { Accept: 'text/markdown' },
        redirect: 'manual',
      })

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('/index.md')
    })

    it('serves markdown for the root path', async () => {
      const response = await fetch(url('/'), {
        headers: { Accept: 'text/markdown' },
      })

      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('text/markdown')

      const content = await response.text()
      expect(content).toContain('# Welcome to Test Site')
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
    it('does not vary the explicit markdown response', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/markdown' },
      })

      expect(response.url).toContain('/about.md')
      expect(response.headers.get('vary')).toBeNull()
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
      expect(response.headers.get('vary')).toBe('Accept, Sec-Fetch-Dest, User-Agent')
      expect(response.headers.get('cache-control')).toContain('no-store')
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

    it('yields (does not 406) for application/json + text/event-stream (MCP/RPC clients)', async () => {
      // MCP clients send `Accept: application/json, text/event-stream`. The
      // middleware must not hijack these requests, otherwise non-content
      // handlers mounted on / paths (e.g. /mcp via @nuxtjs/mcp-toolkit)
      // become unreachable.
      const response = await fetch(url('/about'), {
        headers: { Accept: 'application/json, text/event-stream' },
      })

      expect(response.status).not.toBe(406)
    })
  })

  describe('error handling', () => {
    it('returns 200 with markdown body for non-existent .md route', async () => {
      const response = await fetch(url('/non-existent-page.md'))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/markdown')

      const content = await response.text()
      expect(content).toContain('---')
      expect(content).toContain('Page not found')
    })
  })

  describe('frontmatter', () => {
    it('includes Vercel-spec frontmatter in markdown response', async () => {
      const response = await fetch(url('/about.md'))
      const content = await response.text()

      expect(content.startsWith('---\n')).toBe(true)
      expect(content).toMatch(/title:\s+"/)
      expect(content).toMatch(/canonical_url:\s+"/)
      expect(content).toMatch(/last_updated:\s+"/)
    })
  })

  describe('html alternate hint', () => {
    it('injects <link rel="alternate" type="text/markdown"> into HTML', async () => {
      const response = await fetch(url('/about'), {
        headers: { Accept: 'text/html' },
      })

      const html = await response.text()
      expect(html).toMatch(/<link[^>]+rel="alternate"[^>]+type="text\/markdown"/)
    })
  })
})
