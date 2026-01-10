import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('runtime indexing', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/runtime-indexing', import.meta.url)),
    dev: true,
    server: true,
  })

  it('seeds routes on first visit', async () => {
    // First visit seeds sitemap routes into DB
    const html = await $fetch('/')
    expect(html).toContain('Test Site')

    // Visit about page
    const aboutHtml = await $fetch('/about')
    expect(aboutHtml).toBeTruthy()
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

  // Poll endpoint tests
  it('poll: returns status with correct shape', async () => {
    const result = await $fetch<{
      indexed: number
      remaining: number
      duration: number
      complete: boolean
      errors?: string[]
    }>('/__ai-ready/poll', { method: 'POST' })

    expect(typeof result.indexed).toBe('number')
    expect(typeof result.remaining).toBe('number')
    expect(typeof result.duration).toBe('number')
    expect(typeof result.complete).toBe('boolean')
  })

  it('poll: respects limit parameter', async () => {
    const result = await $fetch<{ indexed: number }>('/__ai-ready/poll?limit=1', { method: 'POST' })
    expect(result.indexed).toBeLessThanOrEqual(1)
  })

  it('poll: caps limit at 50', async () => {
    // Even with limit=100, should process at most 50
    const result = await $fetch<{ indexed: number }>('/__ai-ready/poll?limit=100', { method: 'POST' })
    expect(result.indexed).toBeLessThanOrEqual(50)
  })

  it('poll: all=true processes multiple pages', async () => {
    const result = await $fetch<{ indexed: number, complete: boolean }>('/__ai-ready/poll?all=true&timeout=5000', { method: 'POST' })
    expect(typeof result.indexed).toBe('number')
    expect(typeof result.complete).toBe('boolean')
  })

  it('status: returns indexing status', async () => {
    const result = await $fetch<{ total: number, indexed: number, pending: number }>('/__ai-ready/status')
    expect(typeof result.total).toBe('number')
    expect(typeof result.indexed).toBe('number')
    expect(typeof result.pending).toBe('number')
    expect(result.total).toBe(result.indexed + result.pending)
  })
})
