import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('nuxt generate (static build)', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
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

  describe('llms.txt format', () => {
    it('has valid markdown structure', async () => {
      const llmsTxt = await $fetch('/llms.txt', { responseType: 'text' })

      // Header with site name
      expect(llmsTxt).toMatch(/^# /)

      // Canonical Origin section
      expect(llmsTxt).toContain('Canonical Origin:')

      // Pages section
      expect(llmsTxt).toContain('## Pages')
    })

    it('includes page titles with links', async () => {
      const llmsTxt = await $fetch('/llms.txt', { responseType: 'text' })

      // Pages should have markdown links with titles
      expect(llmsTxt).toMatch(/\[Welcome to Test Site\]\(\/?/)
      expect(llmsTxt).toMatch(/\[About · Test Site — UTF-8 Support\]\(\/about\)/)
    })

    it('includes LLM Resources section', async () => {
      const llmsTxt = await $fetch('/llms.txt', { responseType: 'text' })

      expect(llmsTxt).toContain('## LLM Resources')
      expect(llmsTxt).toContain('llms-full.txt')
    })
  })

  describe('llms-full.txt format', () => {
    it('has valid structure with page sections', async () => {
      const llmsFullTxt = await $fetch('/llms-full.txt', { responseType: 'text' })

      // Header
      expect(llmsFullTxt).toMatch(/^# /)

      // Pages section
      expect(llmsFullTxt).toContain('## Pages')

      // Individual page headings (h3)
      expect(llmsFullTxt).toContain('### ')
    })

    it('includes page source URLs', async () => {
      const llmsFullTxt = await $fetch('/llms-full.txt', { responseType: 'text' })

      // Source URLs for pages
      expect(llmsFullTxt).toMatch(/Source: https?:\/\//)
    })

    it('preserves markdown content from pages', async () => {
      const llmsFullTxt = await $fetch('/llms-full.txt', { responseType: 'text' })

      // Content from index page
      expect(llmsFullTxt).toContain('AI-powered semantic search')

      // Content from about page
      expect(llmsFullTxt).toContain('Technology Stack')
    })
  })

  describe('uTF-8 encoding', () => {
    it('preserves UTF-8 characters in llms.txt files', async () => {
      const llmsTxt = await $fetch('/llms.txt', { responseType: 'text' })
      const llmsFullTxt = await $fetch('/llms-full.txt', { responseType: 'text' })

      expect(llmsTxt).toContain('/about')
      expect(llmsFullTxt).toContain('About · Test Site — UTF-8 Support')

      // Key UTF-8 chars preserved
      expect(llmsFullTxt).toContain('·')
      expect(llmsFullTxt).toContain('—')

      // No corruption
      expect(llmsFullTxt).not.toContain('Â·')
      expect(llmsFullTxt).not.toContain('â€"')

      // Diverse UTF-8
      expect(llmsFullTxt).toContain('é')
      expect(llmsFullTxt).toContain('ñ')
      expect(llmsFullTxt).toContain('中文')
      expect(llmsFullTxt).toContain('🚀')
    })
  })

  describe('static .md files', () => {
    it('generates .md files for prerendered pages', async () => {
      const aboutMd = await $fetch('/about.md', { responseType: 'text' })

      // Valid markdown content
      expect(aboutMd).toContain('About')
      expect(aboutMd).toContain('Technology Stack')
    })

    it('.md files have proper heading structure', async () => {
      const indexMd = await $fetch('/index.md', { responseType: 'text' })

      // h1 and h2 headings converted
      expect(indexMd).toMatch(/^# /m)
      expect(indexMd).toContain('## Features')
    })
  })
})
