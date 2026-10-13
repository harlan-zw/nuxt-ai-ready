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
    const llmsTxt = await $fetch<string>('/llms.txt')

    expect(llmsTxt).toContain('[/about](https://test.example.com/about.md)')
    expect(llmsTxt).toContain('[/docs/api](https://test.example.com/docs/api.md)')
  })

  it('keeps canonical links for route types without a runtime Markdown handler', async () => {
    const llmsTxt = await $fetch<string>('/llms.txt')

    expect(llmsTxt).toContain('[/api/status](https://test.example.com/api/status)')
    expect(llmsTxt).toContain('[/_internal](https://test.example.com/_internal)')
    expect(llmsTxt).toContain('[/guide.pdf](https://test.example.com/guide.pdf)')
    expect(llmsTxt).toContain('[/image.avif](https://test.example.com/image.avif)')
    expect(llmsTxt).not.toContain('/api/status.md')
    expect(llmsTxt).not.toContain('/_internal.md')
    expect(llmsTxt).not.toContain('/guide.pdf.md')
    expect(llmsTxt).not.toContain('/image.avif.md')
  })
})
