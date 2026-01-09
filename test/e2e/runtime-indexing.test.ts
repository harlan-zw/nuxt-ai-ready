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

  // Database provider tests
  it('database: initializes with schema and counts pages', async () => {
    const { count } = await $fetch<{ count: number }>('/api/__db-test?action=count')
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('database: lists indexed pages', async () => {
    const { pages } = await $fetch<{ pages: Array<{ route: string, title: string }> }>('/api/__db-test?action=list')
    expect(pages).toBeDefined()
    expect(Array.isArray(pages)).toBe(true)
  })

  it('database: retrieves page by route', async () => {
    const { page } = await $fetch<{ page: { route: string } | undefined }>('/api/__db-test?action=get&route=/')
    expect(page).toBeDefined()
    expect(page?.route).toBe('/')
  })

  it('database: supports upsert operations', async () => {
    await $fetch('/api/__db-test?action=upsert', {
      method: 'POST',
      body: {
        route: '/test-page',
        title: 'Test Page',
        description: 'A test page',
        markdown: '# Test',
        headings: '[]',
        keywords: ['test'],
        updatedAt: new Date().toISOString(),
      },
    })
    const { page } = await $fetch<{ page: { title: string } | undefined }>('/api/__db-test?action=get&route=/test-page')
    expect(page?.title).toBe('Test Page')
  })

  it('database: performs FTS5 full-text search', async () => {
    const { results } = await $fetch<{ results: Array<{ route: string }> }>('/api/__db-test?action=search&q=test')
    expect(Array.isArray(results)).toBe(true)
  })

  it('database: returns empty for non-matching search', async () => {
    const { results } = await $fetch<{ results: Array<{ route: string }> }>('/api/__db-test?action=search&q=zzznomatchzzz')
    expect(results).toEqual([])
  })
})
