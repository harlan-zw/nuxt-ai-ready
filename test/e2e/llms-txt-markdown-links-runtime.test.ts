import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('llms.txt runtime Markdown links', async () => {
  await setup({
    rootDir: resolve('../fixtures/markdown-links-runtime'),
    dev: true,
    server: true,
    env: {
      NUXT_PUBLIC_SITE_URL: 'https://test.example.com',
    },
  })

  it('links eligible sitemap routes to the runtime Markdown handler', async () => {
    const llmsTxt = await $fetch('/llms.txt') as string

    expect(llmsTxt).toContain('[/about](/about.md)')
    expect(llmsTxt).toContain('[/docs/api](/docs/api.md)')
  })

  it('keeps canonical links for route types without a runtime Markdown handler', async () => {
    const llmsTxt = await $fetch('/llms.txt') as string

    expect(llmsTxt).toContain('[/api/status](/api/status)')
    expect(llmsTxt).toContain('[/_internal](/_internal)')
    expect(llmsTxt).toContain('[/guide.pdf](/guide.pdf)')
    expect(llmsTxt).not.toContain('/api/status.md')
    expect(llmsTxt).not.toContain('/_internal.md')
    expect(llmsTxt).not.toContain('/guide.pdf.md')
  })
})
