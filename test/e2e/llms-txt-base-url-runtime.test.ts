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
    expect(llmsTxt).toContain('- /docs/docs/api')
    expect(llmsTxt).not.toContain('- /about')
    expect(llmsTxt).not.toContain('.md')
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
  })
})
