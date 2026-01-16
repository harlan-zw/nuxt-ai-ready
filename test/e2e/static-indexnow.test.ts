import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

interface PageHashMeta {
  route: string
  hash: string
}

interface BuildMeta {
  buildId: string
  pageCount: number
  createdAt: string
  pages: PageHashMeta[]
}

describe('static IndexNow: pages.meta.json', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    nuxtConfig: {
      nitro: {
        prerender: {
          crawlLinks: true,
          routes: ['/', '/about', '/docs/getting-started'],
          failOnError: false,
        },
      },
      aiReady: {
        indexNow: 'test-indexnow-key',
      },
    },
  })

  describe('pages.meta.json structure', () => {
    it('contains buildId, pageCount, createdAt, and pages array', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      expect(meta).toHaveProperty('buildId')
      expect(meta).toHaveProperty('pageCount')
      expect(meta).toHaveProperty('createdAt')
      expect(meta).toHaveProperty('pages')

      expect(typeof meta.buildId).toBe('string')
      expect(meta.buildId.length).toBeGreaterThan(0)

      expect(typeof meta.pageCount).toBe('number')
      expect(meta.pageCount).toBeGreaterThan(0)

      expect(typeof meta.createdAt).toBe('string')
      expect(new Date(meta.createdAt).getTime()).not.toBeNaN()

      expect(Array.isArray(meta.pages)).toBe(true)
    })

    it('pages array contains route and hash for each page', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      expect(meta.pages.length).toBeGreaterThan(0)

      for (const page of meta.pages) {
        expect(page).toHaveProperty('route')
        expect(page).toHaveProperty('hash')

        expect(typeof page.route).toBe('string')
        expect(page.route.startsWith('/')).toBe(true)

        expect(typeof page.hash).toBe('string')
        expect(page.hash.length).toBe(16) // SHA-256 truncated to 16 chars
      }
    })

    it('pageCount matches pages array length', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      expect(meta.pageCount).toBe(meta.pages.length)
    })

    it('includes expected routes', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta
      const routes = meta.pages.map(p => p.route)

      expect(routes).toContain('/')
      expect(routes).toContain('/about')
      expect(routes).toContain('/docs/getting-started')
    })

    it('hashes are unique per page', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta
      const hashes = meta.pages.map(p => p.hash)
      const uniqueHashes = new Set(hashes)

      // All hashes should be unique (different content = different hash)
      expect(uniqueHashes.size).toBe(hashes.length)
    })

    it('hashes are hex strings', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      for (const page of meta.pages) {
        expect(page.hash).toMatch(/^[0-9a-f]{16}$/)
      }
    })
  })

  describe('indexNow key file', () => {
    it('serves the key verification file', async () => {
      const keyContent = await $fetch('/test-indexnow-key.txt', { responseType: 'text' })

      expect(keyContent).toBe('test-indexnow-key')
    })
  })
})
