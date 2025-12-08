import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { $fetch, setup, useTestContext } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('sitemap lastmod integration', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    env: {
      NUXT_PUBLIC_SITE_URL: 'https://test.example.com',
    },
    nuxtConfig: {
      sitemap: {
        urls: ['/', '/about', '/docs/getting-started', '/docs/api', '/docs/foo/bar'],
      },
      nitro: {
        prerender: {
          crawlLinks: true,
          routes: ['/', '/about', '/docs/getting-started'],
          failOnError: false,
        },
      },
    },
  })

  it('should inject lastmod from manifest into sitemap.xml', async () => {
    const ctx = useTestContext()

    // Read manifest (saved during prerender)
    const manifestPath = join(ctx.nuxt!.options.rootDir, 'node_modules/.cache/nuxt-seo/ai-index/content-hashes.json')
    const manifest = await readFile(manifestPath, 'utf-8').then(data => JSON.parse(data))

    expect(manifest.pages).toBeTruthy()
    expect(Object.keys(manifest.pages).length).toBeGreaterThan(0)

    // Fetch sitemap at runtime (sitemap:resolved hook runs here)
    const sitemap = await $fetch('/sitemap.xml', { responseType: 'text' })

    expect(sitemap).toContain('<?xml')

    // Verify lastmod values in sitemap match manifest timestamps
    for (const [_route, data] of Object.entries(manifest.pages) as [string, any][]) {
      // sitemap strips milliseconds from ISO string
      const expectedLastmod = data.updatedAt.replace(/\.\d{3}Z$/, 'Z')
      expect(sitemap).toContain(`<lastmod>${expectedLastmod}</lastmod>`)
    }
  })
})
