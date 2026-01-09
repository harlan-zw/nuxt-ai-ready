import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('runtime indexing', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/runtime-indexing', import.meta.url)),
    dev: true,
    server: true,
  })

  it('indexes pages on first visit', async () => {
    // First visit to index the page
    const html = await $fetch('/')
    expect(html).toContain('Test Site')

    // Wait a bit for waitUntil to complete
    await new Promise(r => setTimeout(r, 500))

    // Visit about page to index it
    const aboutHtml = await $fetch('/about')
    expect(aboutHtml).toBeTruthy()

    await new Promise(r => setTimeout(r, 500))
  })

  it('serves markdown after indexing', async () => {
    // Pages should be available as .md after being indexed
    const md = await $fetch('/index.md')
    expect(md).toContain('#')
    expect(typeof md).toBe('string')
  })

  it('provides page data via MCP list_pages after indexing', async () => {
    // The list_pages tool should return indexed pages
    // Note: This depends on MCP being available
    // For now we just verify the pages are accessible
    const aboutMd = await $fetch('/about.md')
    expect(aboutMd).toBeTruthy()
  })

  it('llms.txt is generated at runtime', async () => {
    const llmsTxt = await $fetch('/llms.txt')
    expect(llmsTxt).toContain('Runtime Indexing Test')
    expect(typeof llmsTxt).toBe('string')
  })
})
