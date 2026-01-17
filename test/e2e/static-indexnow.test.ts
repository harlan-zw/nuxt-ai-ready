import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

interface BuildMeta {
  buildId: string
  pageCount: number
  createdAt: string
  /** Page hashes - object format (new) */
  pages: Record<string, string>
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
    it('contains buildId, pageCount, createdAt, and pages object', async () => {
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

      expect(typeof meta.pages).toBe('object')
      expect(Array.isArray(meta.pages)).toBe(false)
    })

    it('pages object contains route keys and hash values', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta
      const routes = Object.keys(meta.pages)

      expect(routes.length).toBeGreaterThan(0)

      for (const [route, hash] of Object.entries(meta.pages)) {
        expect(typeof route).toBe('string')
        expect(route.startsWith('/')).toBe(true)

        expect(typeof hash).toBe('string')
        expect(hash.length).toBe(16) // SHA-256 truncated to 16 chars
      }
    })

    it('pageCount matches pages object size', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      expect(meta.pageCount).toBe(Object.keys(meta.pages).length)
    })

    it('includes expected routes', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      expect(meta.pages).toHaveProperty('/')
      expect(meta.pages).toHaveProperty('/about')
      expect(meta.pages).toHaveProperty('/docs/getting-started')
    })

    it('hashes are unique per page', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta
      const hashes = Object.values(meta.pages)
      const uniqueHashes = new Set(hashes)

      // All hashes should be unique (different content = different hash)
      expect(uniqueHashes.size).toBe(hashes.length)
    })

    it('hashes are hex strings', async () => {
      const meta = await $fetch('/__ai-ready/pages.meta.json') as BuildMeta

      for (const hash of Object.values(meta.pages)) {
        expect(hash).toMatch(/^[0-9a-f]{16}$/)
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
