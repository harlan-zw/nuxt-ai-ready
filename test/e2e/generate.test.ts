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

    it('preserves UTF-8 characters correctly in TOON files', async () => {
      const result = await $fetch('/llms.toon', {
        responseType: 'text',
      })

      const data = decode(result) as { pages: Array<{ route: string, title: string, description: string }> }
      const aboutPage = data.pages.find(p => p.route === '/about')

      expect(aboutPage).toBeDefined()
      expect(aboutPage!.title).toBe('About · Test Site — UTF-8 Support')
      expect(aboutPage!.title).toContain('·') // middle dot U+00B7
      expect(aboutPage!.title).toContain('—') // em dash U+2014
      // Verify no double-encoding corruption (UTF-8 bytes interpreted as Latin-1)
      expect(aboutPage!.title).not.toContain('Â·') // would indicate 0xC2 0xB7 misread
      expect(aboutPage!.title).not.toContain('â€"') // would indicate 0xE2 0x80 0x94 misread

      // Check chunks preserve UTF-8
      const chunksResult = await $fetch('/llms-full.toon', {
        responseType: 'text',
      })
      const chunksData = decode(chunksResult) as { pageChunks: Array<{ route: string, content: string }> }
      const aboutChunks = chunksData.pageChunks.filter(c => c.route === '/about')

      expect(aboutChunks.length).toBeGreaterThan(0)
      const allContent = aboutChunks.map(c => c.content).join(' ')
      expect(allContent).toContain('·') // middle dot
      expect(allContent).toContain('—') // em dash
      expect(allContent).toContain('é') // Latin accented
      expect(allContent).toContain('ñ') // Latin accented
      expect(allContent).toContain('中文') // CJK
      expect(allContent).toContain('🚀') // emoji (4-byte UTF-8)
      // Verify no corruption
      expect(allContent).not.toContain('Â·')
      expect(allContent).not.toContain('â€"')
    })

    it('preserves UTF-8 characters in llms.txt files', async () => {
      const llmsTxt = await $fetch('/llms.txt', { responseType: 'text' })
      const llmsFullTxt = await $fetch('/llms-full.txt', { responseType: 'text' })

      // Both should contain the about page with UTF-8 chars
      expect(llmsTxt).toContain('About · Test Site — UTF-8 Support')
      expect(llmsFullTxt).toContain('About · Test Site — UTF-8 Support')

      // Verify key UTF-8 chars preserved
      expect(llmsTxt).toContain('·')
      expect(llmsTxt).toContain('—')
      expect(llmsFullTxt).toContain('·')
      expect(llmsFullTxt).toContain('—')

      // Verify no corruption
      expect(llmsTxt).not.toContain('Â·')
      expect(llmsTxt).not.toContain('â€"')
      expect(llmsFullTxt).not.toContain('Â·')
      expect(llmsFullTxt).not.toContain('â€"')

      // Check content with diverse UTF-8
      expect(llmsFullTxt).toContain('é')
      expect(llmsFullTxt).toContain('ñ')
      expect(llmsFullTxt).toContain('中文')
      expect(llmsFullTxt).toContain('🚀')
    })
  })
})
