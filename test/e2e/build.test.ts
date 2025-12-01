import { existsSync, readFileSync, statSync } from 'node:fs'
import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('nuxt-ai-ready basic e2e', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    nuxtConfig: {
      nitro: {
        prerender: {
          crawlLinks: false,
          routes: ['/', '/about', '/docs/getting-started', '/docs/api'],
          failOnError: false,
        },
      },
    },
  })

  describe('build phase', () => {
    it('generates vector database', () => {
      const dbPath = resolve('../fixtures/basic/.output/server/embeddings.db')
      expect(existsSync(dbPath), `Vector DB should exist at ${dbPath}`).toBe(true)

      // Check DB is not empty
      const stats = statSync(dbPath)
      expect(stats.size).toBeGreaterThan(0)
    })

    it('generates bulk.jsonl', () => {
      const bulkPath = resolve('../fixtures/basic/.output/public/content.jsonl')
      expect(existsSync(bulkPath), `content.jsonl should exist at ${bulkPath}`).toBe(true)

      const content = readFileSync(bulkPath, 'utf-8')
      const lines = content.trim().split('\n')

      // Should have documents for all pages
      expect(lines.length).toBeGreaterThan(0)

      // Each line should be valid JSON
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow()
      })

      // Check structure of first document
      const firstDoc = JSON.parse(lines[0])
      expect(firstDoc).toHaveProperty('route')
      expect(firstDoc).toHaveProperty('title')
      expect(firstDoc).toHaveProperty('description')
      expect(firstDoc).toHaveProperty('chunkIds')
      expect(Array.isArray(firstDoc.chunkIds)).toBe(true)
    })

    it('generates debug chunks', () => {
      const debugDir = resolve('../fixtures/basic/.output/public/__embeddings')
      expect(existsSync(debugDir), 'Debug chunks directory should exist').toBe(true)
    })
  })

  describe('bulk api', () => {
    it('returns JSONL content', async () => {
      const result = await $fetch('/_ai-ready/bulk', {
        responseType: 'text',
      })

      expect(typeof result).toBe('string')

      const lines = result.trim().split('\n')
      expect(lines.length).toBeGreaterThan(0)

      // Each line should be valid JSON
      lines.forEach((line) => {
        const doc = JSON.parse(line)
        expect(doc).toHaveProperty('route')
        expect(doc).toHaveProperty('title')
      })
    })

    it('includes all indexed pages', async () => {
      const result = await $fetch('/_ai-ready/bulk', {
        responseType: 'text',
      })

      const lines = result.trim().split('\n')
      const routes = lines.map(line => JSON.parse(line).route)

      // Should have at least our fixture pages
      expect(routes).toContain('/')
      expect(routes).toContain('/about')
      expect(routes.some(r => r.includes('/docs/'))).toBe(true)
    })
  })
})
