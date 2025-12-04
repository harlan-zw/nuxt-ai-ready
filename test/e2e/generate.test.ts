import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { decode } from '@toon-format/toon'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('nuxt generate (static build)', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true, // Needed for test server, but tests focus on static files
    nuxtConfig: {
      nitro: {
        prerender: {
          crawlLinks: true,
          routes: ['/', '/about', '/docs/getting-started', '/docs/api'],
          failOnError: false,
        },
      },
    },
  })

  describe('static file accessibility', () => {
    it('serves llms-full.toon as static file (chunk-level)', async () => {
      const result = await $fetch('/llms-full.toon', {
        responseType: 'text',
      })

      expect(typeof result).toBe('string')
      const data = decode(result) as { pageChunks: Array<{ id: string, route: string, content: string }> }
      expect(data).toHaveProperty('pageChunks')
      expect(Array.isArray(data.pageChunks)).toBe(true)
      expect(data.pageChunks.length).toBeGreaterThan(0)

      data.pageChunks.forEach((chunk) => {
        expect(chunk).toHaveProperty('id')
        expect(chunk).toHaveProperty('route')
        expect(chunk).toHaveProperty('content')
      })
    })

    it('serves llms.toon as static file (page-level)', async () => {
      const result = await $fetch('/llms.toon', {
        responseType: 'text',
      })

      expect(typeof result).toBe('string')
      const data = decode(result) as { pages: Array<{ route: string, title: string, description: string, headings: string, chunkIds: string }> }
      expect(data).toHaveProperty('pages')
      expect(Array.isArray(data.pages)).toBe(true)
      expect(data.pages.length).toBeGreaterThan(0)

      data.pages.forEach((page) => {
        expect(page).toHaveProperty('route')
        expect(page).toHaveProperty('title')
        expect(page).toHaveProperty('chunkIds')
        expect(typeof page.chunkIds).toBe('string')
      })
    })
  })
})
