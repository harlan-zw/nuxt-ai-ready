import { existsSync, readFileSync, statSync } from 'node:fs'
import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
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

  describe('static files created during generate', () => {
    it('creates vector database during build', () => {
      const dbPath = resolve('../fixtures/basic/.output/server/embeddings.db')
      expect(existsSync(dbPath), `Vector DB at ${dbPath}`).toBe(true)

      const stats = statSync(dbPath)
      expect(stats.size).toBeGreaterThan(0)
    })

    it('prerenders bulk.jsonl as static file', () => {
      const bulkPath = resolve('../fixtures/basic/.output/public/content.jsonl')
      expect(existsSync(bulkPath), `bulk.jsonl at ${bulkPath}`).toBe(true)

      const content = readFileSync(bulkPath, 'utf-8')
      const lines = content.trim().split('\n')

      expect(lines.length).toBeGreaterThan(0)

      // Verify JSONL format
      lines.forEach((line) => {
        const doc = JSON.parse(line)
        expect(doc).toHaveProperty('route')
        expect(doc).toHaveProperty('title')
        expect(doc).toHaveProperty('description')
        expect(doc).toHaveProperty('chunkIds')
      })
    })

    it('generates debug chunks when debug enabled', () => {
      const debugDir = resolve('../fixtures/basic/.output/public/__embeddings')
      expect(existsSync(debugDir), 'Debug chunks dir').toBe(true)

      // Should have chunk files for indexed routes
      const entries = readFileSync(`${debugDir}`, { encoding: 'utf-8', flag: 'r' }).toString()
      expect(entries.length).toBeGreaterThan(0)
    })
  })

  describe('static file accessibility', () => {
    it('serves bulk.jsonl as static file', async () => {
      const result = await $fetch('/content.jsonl', {
        responseType: 'text',
      })

      expect(typeof result).toBe('string')
      const lines = result.trim().split('\n')
      expect(lines.length).toBeGreaterThan(0)

      lines.forEach((line) => {
        const doc = JSON.parse(line)
        expect(doc).toHaveProperty('route')
        expect(doc).toHaveProperty('chunkIds')
      })
    })
  })
})
