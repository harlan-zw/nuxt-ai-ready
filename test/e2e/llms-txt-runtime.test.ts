import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

const RE_MD_H1 = /^# /
const RE_MD_ABS_LINK = /- \[.*\]\(https?:\/\//

describe('llms.txt runtime generation with sitemap', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    dev: true,
    server: true,
    env: {
      NUXT_PUBLIC_SITE_URL: 'https://test.example.com',
    },
    nuxtConfig: {
      sitemap: {
        urls: ['/', '/about', '/docs/getting-started', '/docs/api'],
      },
    },
  })

  it('generates llms.txt with pages from sitemap', async () => {
    const llmsTxt = await $fetch('/llms.txt')

    expect(llmsTxt).toBeTruthy()
    expect(typeof llmsTxt).toBe('string')

    // Should have header
    expect(llmsTxt).toContain('# ')

    // Should have LLM Resources section
    expect(llmsTxt).toContain('## LLM Resources')
    expect(llmsTxt).toContain('llms-full.txt')

    // Should have Pages section with sitemap URLs
    expect(llmsTxt).toContain('## Pages')
    expect(llmsTxt).toContain('/about')
    expect(llmsTxt).toContain('/docs/getting-started')
    expect(llmsTxt).toContain('/docs/api')
  })

  it('llms.txt content is valid markdown format', async () => {
    const llmsTxt = await $fetch('/llms.txt') as string

    // Should be valid llms.txt format with proper structure
    const lines = llmsTxt.split('\n')

    // First line should be header
    expect(lines[0]).toMatch(RE_MD_H1)

    // Should have sitemap/robots links with absolute URLs
    expect(llmsTxt).toMatch(RE_MD_ABS_LINK)
  })
})
