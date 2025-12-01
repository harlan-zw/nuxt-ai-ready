import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('mdream hooks e2e', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/hooks', import.meta.url)),
    dev: false,
    server: true,
    build: true,
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

  describe('mdream:markdown hook', () => {
    it('should call hook when serving .md routes', async () => {
      // This tests the runtime hook by fetching a .md route
      const markdown = await $fetch('/index.md')
      expect(markdown).toBeTruthy()
      expect(typeof markdown).toBe('string')
      expect(markdown).toContain('# Welcome to Test Site')
    })

    it('should work for multiple routes', async () => {
      const aboutMarkdown = await $fetch('/about.md')
      expect(aboutMarkdown).toBeTruthy()
      expect(typeof aboutMarkdown).toBe('string')
      expect(aboutMarkdown).toContain('# About')
    })
  })

  describe('mdream:llms-txt:generate hook', () => {
    it('should generate llms.txt with hook modifications', async () => {
      const llmsTxt = await $fetch('/llms.txt')
      expect(llmsTxt).toBeTruthy()
      expect(typeof llmsTxt).toBe('string')

      // Should contain the custom section added by the hook
      expect(llmsTxt).toContain('## Custom Hook Section')
      expect(llmsTxt).toContain('This was added by a hook!')
    })

    it('should generate llms-full.txt with hook modifications', async () => {
      const llmsFullTxt = await $fetch('/llms-full.txt')
      expect(llmsFullTxt).toBeTruthy()
      expect(typeof llmsFullTxt).toBe('string')

      // Should contain the custom section added by the hook
      expect(llmsFullTxt).toContain('## Custom Hook Section (Full)')
      expect(llmsFullTxt).toContain('This was added by a hook!')
    })
  })

  describe('ai-ready:chunk hook', () => {
    it('should call hook for each chunk during prerender', async () => {
      const testChunksPath = resolve(
        fileURLToPath(new URL('../fixtures/hooks', import.meta.url)),
        '.output/test-chunks.json',
      )

      expect(existsSync(testChunksPath)).toBe(true)

      const chunks = JSON.parse(readFileSync(testChunksPath, 'utf-8'))
      expect(Array.isArray(chunks)).toBe(true)
      expect(chunks.length).toBeGreaterThan(0)

      // Verify chunk structure
      const firstChunk = chunks[0]
      expect(firstChunk).toHaveProperty('id')
      expect(firstChunk).toHaveProperty('route')
      expect(firstChunk).toHaveProperty('chunkIndex')
      expect(firstChunk).toHaveProperty('title')
      expect(firstChunk).toHaveProperty('contentPreview')

      // Verify we have chunks from different routes
      const routes = new Set(chunks.map((c: any) => c.route))
      expect(routes.size).toBeGreaterThan(1)
    })

    it('should provide correct chunk metadata', async () => {
      const testChunksPath = resolve(
        fileURLToPath(new URL('../fixtures/hooks', import.meta.url)),
        '.output/test-chunks.json',
      )

      const chunks = JSON.parse(readFileSync(testChunksPath, 'utf-8'))

      // Find a chunk from the home page
      const homeChunk = chunks.find((c: any) => c.route === '/')
      expect(homeChunk).toBeTruthy()
      expect(homeChunk.title).toBe('Welcome to Test Site')
      expect(homeChunk.chunkIndex).toBeGreaterThanOrEqual(0)
      expect(homeChunk.id).toMatch(/^[a-f0-9]{48}-\d+$/)
    })
  })
})
