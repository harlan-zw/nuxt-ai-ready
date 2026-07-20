import { createResolver } from '@nuxt/kit'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('ai-ready routes beneath an app base URL', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-txt-base-url-runtime'),
    dev: false,
    server: true,
  })

  it('reapplies the app base to logical sitemap routes exactly once', async () => {
    await $fetch('/docs/api/__seed-page', {
      method: 'POST',
      body: { action: 'delete', route: '/docs/about' },
    })
    await $fetch('/docs/api/__seed-page', {
      method: 'POST',
      body: { action: 'delete', route: '/docs/api' },
    })

    const llmsTxt = await $fetch('/docs/llms.txt') as string

    expect(llmsTxt).toContain('- /docs/about')
    expect(llmsTxt).not.toContain('- /docs/about/')
    expect(llmsTxt).toContain('- /docs/docs/api')
    expect(llmsTxt).not.toContain('- /about')
    expect(llmsTxt).not.toContain('.md')
    expect(llmsTxt).toContain('Canonical Origin: https://test.example.com/docs')
    expect(llmsTxt).toContain('[Full Content](https://test.example.com/docs/llms-full.txt)')
    expect(llmsTxt).toContain('[sitemap.xml](https://test.example.com/docs/sitemap.xml)')
    expect(llmsTxt).toContain('[robots.txt](https://test.example.com/docs/robots.txt)')

    const secondLlmsTxt = await $fetch('/docs/llms.txt') as string
    expect(secondLlmsTxt.match(/\[sitemap\.xml\]/g)).toHaveLength(1)
    expect(secondLlmsTxt.match(/\[robots\.txt\]/g)).toHaveLength(1)
  })

  it('normalizes persisted routes that already include the app base', async () => {
    await $fetch('/docs/api/__seed-page', {
      method: 'POST',
      body: {
        action: 'upsert',
        route: '/docs/about',
        title: 'Persisted About',
      },
    })
    await $fetch('/docs/api/__seed-page', {
      method: 'POST',
      body: {
        action: 'upsert',
        route: '/docs/api',
        title: 'Persisted Docs API',
      },
    })

    const llmsTxt = await $fetch('/docs/llms.txt') as string

    expect(llmsTxt).toContain('[Persisted About](/docs/about)')
    expect(llmsTxt).toContain('[Persisted Docs API](/docs/docs/api)')
    expect(llmsTxt).not.toContain('/docs/docs/about')
    expect(llmsTxt.match(/\/docs\/about/g)).toHaveLength(1)
  })

  it('redirects negotiated Markdown requests within the app base', async () => {
    const response = await fetch(url('/docs/about'), {
      headers: { accept: 'text/markdown' },
      redirect: 'manual',
    })

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/docs/about.md')
  })

  it('fetches source HTML within the app base for explicit Markdown routes', async () => {
    const markdown = await $fetch('/docs/about.md') as string

    expect(markdown).toContain('Technology Stack')
    expect(markdown).not.toContain('# Page not found')
    expect(markdown).toContain('canonical_url: "https://test.example.com/docs/about"')
  })

  it('preserves a logical route whose first segment matches the app base', async () => {
    const markdown = await $fetch('/docs/docs/api.md') as string

    expect(markdown).toContain('API Reference')
    expect(markdown).toContain('canonical_url: "https://test.example.com/docs/docs/api"')
  })

  it('advertises base-aware representation links', async () => {
    const htmlResponse = await fetch(url('/docs/about'), {
      headers: { accept: 'text/html' },
    })
    expect(htmlResponse.headers.get('link')).toContain('<https://test.example.com/docs/about.md>')

    const markdownResponse = await fetch(url('/docs/about.md'))
    expect(markdownResponse.headers.get('link')).toContain('<https://test.example.com/docs/about>')
  })

  it('uses deployed URLs in fallback Markdown and llms-full.txt', async () => {
    const notFound = await $fetch('/docs/not-found.md') as string
    expect(notFound).toContain('[Sitemap](https://test.example.com/docs/sitemap.xml)')
    expect(notFound).toContain('[llms.txt](https://test.example.com/docs/llms.txt)')

    const llmsFullTxt = await $fetch('/docs/llms-full.txt') as string
    expect(llmsFullTxt).toContain('Canonical Origin: https://test.example.com/docs')
  })
})
