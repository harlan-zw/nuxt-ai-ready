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

  describe('static file accessibility', () => {
    it('serves bulk.jsonl as static file', async () => {
      const result = await $fetch('/content.jsonl', {
        responseType: 'text',
      })

      expect(typeof result).toBe('string')
      // @ts-expect-error untyped
      const lines = result.trim().split('\n')
      expect(lines.length).toBeGreaterThan(0)

      // @ts-expect-error untyped
      lines.forEach((line) => {
        const doc = JSON.parse(line)
        expect(doc).toHaveProperty('route')
      })
    })
  })
})
