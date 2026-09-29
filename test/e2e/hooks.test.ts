import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('ai-ready hooks e2e', async () => {
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

  describe('ai-ready:page:markdown hook', () => {
    it('includes build-time hook mutations in prerendered Markdown', async () => {
      const markdown = await $fetch('/index.md')
      expect(markdown).toBeTruthy()
      expect(typeof markdown).toBe('string')
      expect(markdown).toContain('# Welcome to Test Site')
      expect(markdown).toContain('Build-time Markdown hook was here.')
    })

    it('includes build-time hook mutations for multiple routes', async () => {
      const aboutMarkdown = await $fetch('/about.md')
      expect(aboutMarkdown).toBeTruthy()
      expect(typeof aboutMarkdown).toBe('string')
      expect(aboutMarkdown).toContain('# About')
      expect(aboutMarkdown).toContain('Build-time Markdown hook was here.')
    })
  })

  describe('nitro conversion hooks', () => {
    it('apply to prerendered Markdown', async () => {
      const aboutMarkdown = await $fetch('/about.md') as string
      expect(aboutMarkdown).toContain('Nitro Markdown hook ran (isPrerender: true).')
      expect(aboutMarkdown).not.toContain('Transformers.js')
    })

    it('apply to llms-full.txt', async () => {
      const llmsFullTxt = await $fetch('/llms-full.txt') as string
      expect(llmsFullTxt).toContain('Nitro Markdown hook ran (isPrerender: true).')
      expect(llmsFullTxt).not.toContain('Transformers.js')
    })
  })

  describe('converted page frontmatter', () => {
    it('puts the description at the root, as Content source pages do', async () => {
      const aboutMarkdown = await $fetch('/about.md') as string
      const frontmatter = aboutMarkdown.split('---')[1]
      expect(frontmatter).toMatch(/^description: "Learn about this test site/m)
      expect(frontmatter).not.toMatch(/^\s+description:/m)
    })
  })

  describe('ai-ready:llms-txt hook', () => {
    it('should generate llms.txt with hook modifications', async () => {
      const llmsTxt = await $fetch('/llms.txt')
      expect(llmsTxt).toBeTruthy()
      expect(typeof llmsTxt).toBe('string')

      // Description-only sections belong in the heading-free preamble.
      expect(llmsTxt).toContain('**Custom Hook Section:**')
      expect(llmsTxt).not.toContain('## Custom Hook Section')
      expect(llmsTxt).toContain('This was added by a hook!')
      expect(llmsTxt).toContain('(/docs/api.md)')
    })

    it('should generate llms-full.txt with hook modifications', async () => {
      const llmsFullTxt = await $fetch('/llms-full.txt')
      expect(llmsFullTxt).toBeTruthy()
      expect(typeof llmsFullTxt).toBe('string')

      // Should contain both llms-txt and page Markdown hook modifications
      expect(llmsFullTxt).toContain('**Custom Hook Section:**')
      expect(llmsFullTxt).not.toContain('## Custom Hook Section')
      expect(llmsFullTxt).toContain('This was added by a hook!')
      expect(llmsFullTxt).toContain('Custom Hook Section (Full)')
      expect(llmsFullTxt).toContain('Build-time Markdown hook was here.')
      expect(llmsFullTxt).not.toContain('- **Page:** API Reference - Docs')
      expect(llmsFullTxt).not.toContain('- **Source:** /docs/api')
    })
  })
})
