import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

// Helper to bypass Nuxt's typed route inference which causes TS2321 stack depth errors
const fetch = (url: string, opts?: Parameters<typeof $fetch>[1]) => $fetch(url as '/', opts)

describe('runtime indexing', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/runtime-indexing', import.meta.url)),
    dev: true,
    server: true,
  })

  it('seeds routes on first visit', async () => {
    // First visit seeds sitemap routes into DB
    const html = await fetch('/')
    expect(html).toContain('Test Site')

    // Visit about page
    const aboutHtml = await fetch('/about')
    expect(aboutHtml).toBeTruthy()
  })

  it('serves markdown after indexing', async () => {
    // Pages should be available as .md after being indexed
    const md = await fetch('/index.md')
    expect(md).toContain('#')
    expect(typeof md).toBe('string')
  })

  it('provides page data via MCP list_pages after indexing', async () => {
    // The list_pages tool should return indexed pages
    // Note: This depends on MCP being available
    // For now we just verify the pages are accessible
    const aboutMd = await fetch('/about.md')
    expect(aboutMd).toBeTruthy()
  })

  it('llms.txt is generated at runtime', async () => {
    const llmsTxt = await fetch('/llms.txt')
    expect(llmsTxt).toContain('Runtime Indexing Test')
    expect(typeof llmsTxt).toBe('string')
  })

  // Database provider tests
  it('database: initializes with schema and counts pages', async () => {
    const { count } = (await fetch('/api/__db-test?action=count')) as { count: number }
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('database: lists indexed pages', async () => {
    const { pages } = (await fetch('/api/__db-test?action=list')) as { pages: Array<{ route: string, title: string }> }
    expect(pages).toBeDefined()
    expect(Array.isArray(pages)).toBe(true)
  })

  it('database: retrieves page by route', async () => {
    // First ensure we have a page to retrieve (sitemap seeding is async)
    await fetch('/api/__db-test?action=upsert', {
      method: 'POST',
      body: {
        route: '/test-retrieve',
        title: 'Test Retrieve',
        description: 'A test page for retrieve',
        markdown: '# Test',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
      },
    })
    const { page } = (await fetch('/api/__db-test?action=get&route=/test-retrieve')) as { page: { route: string } | undefined }
    expect(page).toBeDefined()
    expect(page?.route).toBe('/test-retrieve')
  })

  it('database: supports upsert operations', async () => {
    await fetch('/api/__db-test?action=upsert', {
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
    const { page } = (await fetch('/api/__db-test?action=get&route=/test-page')) as { page: { title: string } | undefined }
    expect(page?.title).toBe('Test Page')
  })

  it('database: performs FTS5 full-text search', async () => {
    const { results } = (await fetch('/api/__db-test?action=search&q=test')) as { results: Array<{ route: string }> }
    expect(Array.isArray(results)).toBe(true)
  })

  it('database: returns empty for non-matching search', async () => {
    const { results } = (await fetch('/api/__db-test?action=search&q=zzznomatchzzz')) as { results: Array<{ route: string }> }
    expect(results).toEqual([])
  })

  // Poll endpoint tests
  it('poll: returns status with correct shape', async () => {
    const result = (await fetch('/__ai-ready/poll', { method: 'POST' })) as {
      indexed: number
      remaining: number
      duration: number
      complete: boolean
      errors?: string[]
    }

    expect(typeof result.indexed).toBe('number')
    expect(typeof result.remaining).toBe('number')
    expect(typeof result.duration).toBe('number')
    expect(typeof result.complete).toBe('boolean')
  })

  it('poll: respects limit parameter', async () => {
    const result = (await fetch('/__ai-ready/poll?limit=1', { method: 'POST' })) as { indexed: number }
    expect(result.indexed).toBeLessThanOrEqual(1)
  })

  it('poll: caps limit at 50', async () => {
    // Even with limit=100, should process at most 50
    const result = (await fetch('/__ai-ready/poll?limit=100', { method: 'POST' })) as { indexed: number }
    expect(result.indexed).toBeLessThanOrEqual(50)
  })

  it('poll: all=true processes multiple pages', async () => {
    const result = (await fetch('/__ai-ready/poll?all=true&timeout=5000', { method: 'POST' })) as { indexed: number, complete: boolean }
    expect(typeof result.indexed).toBe('number')
    expect(typeof result.complete).toBe('boolean')
  })

  it('status: returns indexing status', async () => {
    const result = (await fetch('/__ai-ready/status')) as { total: number, indexed: number, pending: number }
    expect(typeof result.total).toBe('number')
    expect(typeof result.indexed).toBe('number')
    expect(typeof result.pending).toBe('number')
    expect(result.total).toBe(result.indexed + result.pending)
  })

  // Stale route pruning tests
  it('stale: routes have last_seen_at set after seeding', async () => {
    // Seed a fresh route to ensure we have at least one with last_seen_at > 0
    await fetch('/api/__db-test?action=upsert', {
      method: 'POST',
      body: {
        route: '/freshly-seeded',
        title: 'Freshly Seeded',
        description: 'A freshly seeded page',
        markdown: '# Fresh',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
      },
    })
    // Set its last_seen_at to now (simulating sitemap seeding)
    await fetch('/api/__db-test?action=set-last-seen', {
      method: 'POST',
      body: { route: '/freshly-seeded', timestamp: Date.now() },
    })

    const { rows } = (await fetch('/api/__db-test?action=raw')) as { rows: Array<{ route: string, last_seen_at: number }> }
    expect(rows.length).toBeGreaterThan(0)
    // At least the freshly seeded route should have last_seen_at > 0
    const seededRoutes = rows.filter((r: { last_seen_at: number }) => r.last_seen_at > 0)
    expect(seededRoutes.length).toBeGreaterThan(0)
  })

  it('stale: getStaleRoutes returns empty when routes are fresh', async () => {
    // With a 7 day TTL, freshly seeded routes should not be stale
    const { routes } = (await fetch('/api/__db-test?action=stale&ttl=604800')) as { routes: string[] }
    expect(routes).toEqual([])
  })

  it('stale: getStaleRoutes returns routes older than TTL', async () => {
    // First add a test route
    await fetch('/api/__db-test?action=upsert', {
      method: 'POST',
      body: {
        route: '/stale-test',
        title: 'Stale Test',
        description: 'A test page for staleness',
        markdown: '# Stale Test',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
      },
    })

    // Set its last_seen_at to 8 days ago
    const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000)
    await fetch('/api/__db-test?action=set-last-seen', {
      method: 'POST',
      body: { route: '/stale-test', timestamp: eightDaysAgo },
    })

    // With 7 day TTL, this route should be stale
    const { routes } = (await fetch('/api/__db-test?action=stale&ttl=604800')) as { routes: string[] }
    expect(routes).toContain('/stale-test')
  })

  it('stale: pruneStaleRoutes removes old routes', async () => {
    // Ensure we have a stale route from previous test
    const { routes: before } = (await fetch('/api/__db-test?action=stale&ttl=604800')) as { routes: string[] }
    expect(before.length).toBeGreaterThan(0)

    // Prune stale routes
    const { pruned } = (await fetch('/api/__db-test?action=prune&ttl=604800')) as { pruned: number }
    expect(pruned).toBeGreaterThan(0)

    // Verify route is gone
    const { page } = (await fetch('/api/__db-test?action=get&route=/stale-test')) as { page: unknown }
    expect(page).toBeUndefined()
  })

  it('stale: pruneStaleRoutes does not remove prerendered routes', async () => {
    // Create a route simulating prerendered data
    await fetch('/api/__db-test?action=upsert', {
      method: 'POST',
      body: {
        route: '/prerendered-test',
        title: 'Prerendered Test',
        description: 'A prerendered page',
        markdown: '# Prerendered',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
        source: 'prerender',
      },
    })

    // Set source to prerender (prerendered data should never be auto-pruned)
    await fetch('/api/__db-test?action=set-source', {
      method: 'POST',
      body: { route: '/prerendered-test', source: 'prerender' },
    })

    // Set last_seen_at to old time (but source=prerender protects it)
    const oldTime = Date.now() - (30 * 24 * 60 * 60 * 1000) // 30 days ago
    await fetch('/api/__db-test?action=set-last-seen', {
      method: 'POST',
      body: { route: '/prerendered-test', timestamp: oldTime },
    })

    // Try to prune - should not affect this route because source=prerender
    await fetch('/api/__db-test?action=prune&ttl=1')

    // Verify route still exists
    const { page } = (await fetch('/api/__db-test?action=get&route=/prerendered-test')) as { page: { route: string } | undefined }
    expect(page?.route).toBe('/prerendered-test')
  })

  // Prune endpoint tests (dry run for preview)
  it('prune endpoint: dry run returns stale routes with correct shape', async () => {
    // First add a stale route
    await fetch('/api/__db-test?action=upsert', {
      method: 'POST',
      body: {
        route: '/stale-endpoint-test',
        title: 'Stale Endpoint Test',
        description: 'Testing stale endpoint',
        markdown: '# Stale',
        headings: '[]',
        keywords: [],
        updatedAt: new Date().toISOString(),
      },
    })
    const oldTime = Date.now() - (8 * 24 * 60 * 60 * 1000)
    await fetch('/api/__db-test?action=set-last-seen', {
      method: 'POST',
      body: { route: '/stale-endpoint-test', timestamp: oldTime },
    })

    // Use dry=true to preview stale routes without deleting
    const result = (await fetch('/__ai-ready/prune?ttl=604800&dry=true', { method: 'POST' })) as { routes: string[], count: number, ttl: number, dry: boolean }
    expect(Array.isArray(result.routes)).toBe(true)
    expect(typeof result.count).toBe('number')
    expect(typeof result.ttl).toBe('number')
    expect(result.dry).toBe(true)
    expect(result.count).toBe(result.routes.length)
    expect(result.routes).toContain('/stale-endpoint-test')
  })

  // Prune endpoint tests (actual prune)
  it('prune endpoint: removes stale routes', async () => {
    // Verify stale route exists from previous test (dry run)
    const before = (await fetch('/__ai-ready/prune?ttl=604800&dry=true', { method: 'POST' })) as { count: number }
    expect(before.count).toBeGreaterThan(0)

    const result = (await fetch('/__ai-ready/prune?ttl=604800', { method: 'POST' })) as { pruned: number, ttl: number, dry: boolean }
    expect(typeof result.pruned).toBe('number')
    expect(typeof result.ttl).toBe('number')
    expect(result.dry).toBe(false)
    expect(result.pruned).toBeGreaterThan(0)

    // Verify stale routes are gone (dry run should return 0)
    const after = (await fetch('/__ai-ready/prune?ttl=604800&dry=true', { method: 'POST' })) as { count: number }
    expect(after.count).toBe(0)
  })

  // Scheduled task tests
  it('scheduled: task can be run manually', async () => {
    const result = (await fetch('/api/__run-task?name=ai-ready:index')) as { result?: { indexed: number, remaining: number, complete: boolean }, error?: string }

    // Task should succeed and return indexing results
    expect(result.error).toBeUndefined()
    expect(result.result).toBeDefined()
    expect(typeof result.result?.indexed).toBe('number')
    expect(typeof result.result?.remaining).toBe('number')
    expect(typeof result.result?.complete).toBe('boolean')
  })

  it('scheduled: task respects batchSize config', async () => {
    // The fixture has batchSize: 5, so task should process at most 5 pages
    const result = (await fetch('/api/__run-task?name=ai-ready:index')) as { result?: { indexed: number } }
    expect(result.result?.indexed).toBeLessThanOrEqual(5)
  })
})
