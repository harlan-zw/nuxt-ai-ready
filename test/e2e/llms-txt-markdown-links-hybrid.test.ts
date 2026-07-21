import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { $fetch, setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('llms.txt Markdown links in a hybrid build', async () => {
  await setup({
    rootDir: resolve('../fixtures/markdown-links-runtime'),
    build: true,
    server: true,
    nuxtConfig: {
      app: {
        baseURL: '/docs/',
      },
      nitro: {
        static: false,
        prerender: {
          crawlLinks: false,
          routes: ['/', '/sitemap.xml'],
          failOnError: false,
        },
      },
    },
  })

  it('uses the deployed runtime Markdown handler for sitemap-only routes', async () => {
    const buildDir = useTestContext().nuxt?.options.buildDir
    expect(buildDir).toBeTruthy()
    expect(existsSync(join(buildDir!, 'output/public/llms.txt'))).toBe(true)
    expect(existsSync(join(buildDir!, 'output/public/docs/api.md'))).toBe(false)

    const llmsTxt = await $fetch('/docs/llms.txt') as string
    expect(llmsTxt).toContain('(/docs/docs/api.md)')
    expect(llmsTxt).not.toContain('(/docs/api.md)')

    const apiMarkdown = await $fetch('/docs/docs/api.md') as string
    expect(apiMarkdown).toContain('API Reference')
  })
})
