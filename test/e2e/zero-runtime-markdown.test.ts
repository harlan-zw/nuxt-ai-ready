import { createResolver } from '@nuxt/kit'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('zeroRuntimeMarkdown', async () => {
  await setup({
    rootDir: resolve('../fixtures/markdown-links-runtime'),
    build: true,
    server: true,
    nuxtConfig: {
      aiReady: { zeroRuntimeMarkdown: true },
      app: { baseURL: '/docs/' },
      routeRules: {
        '/': { prerender: true },
        '/about': { prerender: true },
        '/sitemap.xml': { prerender: true },
      },
      nitro: {
        prerender: { crawlLinks: false },
      },
    },
  })

  it('redirects to and serves prerendered Markdown with its canonical link', async () => {
    const request = await fetch(url('/docs/about'), {
      headers: { Accept: 'text/markdown' },
      redirect: 'manual',
    })
    expect(request.status).toBe(307)
    expect(request.headers.get('location')).toBe('/docs/about.md')

    const markdown = await fetch(url('/docs/about.md'))
    expect(markdown.status).toBe(200)
    expect(markdown.headers.get('content-type')).toContain('text/markdown')
    expect(markdown.headers.get('link')).toContain('</docs/about>; rel="canonical"')
    expect(await markdown.text()).toContain('# About')
  })

  it('serves HTML without advertising an unavailable Markdown twin', async () => {
    const page = await fetch(url('/docs/docs/api'), { headers: { Accept: 'text/markdown' }, redirect: 'manual' })
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(page.headers.get('link')).toContain('rel="describedby"')
    expect(page.headers.get('link')).not.toContain('text/markdown')
    expect(await page.text()).not.toContain('type="text/markdown"')

    const missing = await fetch(url('/docs/docs/api.md'))
    expect(missing.status).toBe(404)
  })

  it('uses Markdown links in llms.txt only for available files', async () => {
    const llms = await fetch(url('/docs/llms.txt'))
    expect(llms.status).toBe(200)
    const body = await llms.text()
    expect(body).toContain('(https://test.example.com/docs/about.md)')
    expect(body).toContain('(https://test.example.com/docs/docs/api)')
    expect(body).not.toContain('https://test.example.com/docs/docs/api.md')
  })
})
