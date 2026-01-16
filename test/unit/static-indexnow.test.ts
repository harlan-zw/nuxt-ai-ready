import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface PageHashMeta {
  route: string
  hash: string
}

interface BuildMeta {
  buildId: string
  pageCount: number
  createdAt: string
  pages: PageHashMeta[]
}

// Mock fetch responses
const mockFetch = vi.fn()

// Inline the comparison logic from prerender.ts for testing
function comparePageHashes(
  currentPages: PageHashMeta[],
  prevMeta: BuildMeta | null,
): { changed: string[], added: string[], removed: string[] } {
  if (!prevMeta?.pages) {
    return { changed: [], added: [], removed: [] }
  }

  const prevHashes = new Map(prevMeta.pages.map(p => [p.route, p.hash]))
  const currentRoutes = new Set(currentPages.map(p => p.route))

  const changed: string[] = []
  const added: string[] = []

  for (const page of currentPages) {
    const prevHash = prevHashes.get(page.route)
    if (!prevHash) {
      added.push(page.route)
    }
    else if (prevHash !== page.hash) {
      changed.push(page.route)
    }
  }

  // Find removed pages
  const removed: string[] = []
  for (const route of prevHashes.keys()) {
    if (!currentRoutes.has(route)) {
      removed.push(route)
    }
  }

  return { changed, added, removed }
}

// Inline the static IndexNow handler logic for testing
async function handleStaticIndexNow(
  currentPages: PageHashMeta[],
  siteUrl: string,
  indexNow: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ skipped: string, submitted?: number, error?: string } | { success: true, submitted: number }> {
  // Try fetch previous build meta from live site
  const metaUrl = `${siteUrl}/__ai-ready/pages.meta.json`

  const prevMeta = await fetchFn(metaUrl)
    .then(r => r.ok ? r.json() as Promise<BuildMeta> : null)
    .catch(() => null)

  if (!prevMeta?.pages) {
    return { skipped: 'first_deploy' }
  }

  // Verify key file is live
  const keyUrl = `${siteUrl}/${indexNow}.txt`
  const keyLive = await fetchFn(keyUrl)
    .then(r => r.ok)
    .catch(() => false)

  if (!keyLive) {
    return { skipped: 'key_not_live' }
  }

  const { changed, added } = comparePageHashes(currentPages, prevMeta)
  const totalChanged = changed.length + added.length

  if (totalChanged === 0) {
    return { skipped: 'no_changes' }
  }

  // Submit to IndexNow
  const urls = [...changed, ...added].map(route => `${siteUrl}${route}`)
  const body = {
    host: new URL(siteUrl).host,
    key: indexNow,
    keyLocation: `${siteUrl}/${indexNow}.txt`,
    urlList: urls,
  }

  const response = await fetchFn('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.ok ? { ok: true } : { error: `HTTP ${r.status}` }).catch((err: Error) => ({ error: err.message }))

  if ('error' in response) {
    return { skipped: 'submission_failed', error: response.error }
  }

  return { success: true, submitted: totalChanged }
}

describe('static-indexnow: hash comparison', () => {
  it('detects no changes when hashes match', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'abc123' },
      { route: '/about', hash: 'def456' },
    ]
    const prev: BuildMeta = {
      buildId: 'old',
      pageCount: 2,
      createdAt: '2025-01-01',
      pages: [
        { route: '/', hash: 'abc123' },
        { route: '/about', hash: 'def456' },
      ],
    }

    const result = comparePageHashes(current, prev)
    expect(result.changed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('detects changed pages', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'abc123' },
      { route: '/about', hash: 'CHANGED' },
    ]
    const prev: BuildMeta = {
      buildId: 'old',
      pageCount: 2,
      createdAt: '2025-01-01',
      pages: [
        { route: '/', hash: 'abc123' },
        { route: '/about', hash: 'def456' },
      ],
    }

    const result = comparePageHashes(current, prev)
    expect(result.changed).toEqual(['/about'])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('detects added pages', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'abc123' },
      { route: '/about', hash: 'def456' },
      { route: '/new-page', hash: 'ghi789' },
    ]
    const prev: BuildMeta = {
      buildId: 'old',
      pageCount: 2,
      createdAt: '2025-01-01',
      pages: [
        { route: '/', hash: 'abc123' },
        { route: '/about', hash: 'def456' },
      ],
    }

    const result = comparePageHashes(current, prev)
    expect(result.changed).toEqual([])
    expect(result.added).toEqual(['/new-page'])
    expect(result.removed).toEqual([])
  })

  it('detects removed pages', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'abc123' },
    ]
    const prev: BuildMeta = {
      buildId: 'old',
      pageCount: 2,
      createdAt: '2025-01-01',
      pages: [
        { route: '/', hash: 'abc123' },
        { route: '/about', hash: 'def456' },
      ],
    }

    const result = comparePageHashes(current, prev)
    expect(result.changed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual(['/about'])
  })

  it('detects mixed changes', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'CHANGED' },
      { route: '/new', hash: 'new123' },
    ]
    const prev: BuildMeta = {
      buildId: 'old',
      pageCount: 2,
      createdAt: '2025-01-01',
      pages: [
        { route: '/', hash: 'abc123' },
        { route: '/removed', hash: 'xxx' },
      ],
    }

    const result = comparePageHashes(current, prev)
    expect(result.changed).toEqual(['/'])
    expect(result.added).toEqual(['/new'])
    expect(result.removed).toEqual(['/removed'])
  })

  it('returns empty when no previous meta', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'abc123' },
    ]

    const result = comparePageHashes(current, null)
    expect(result.changed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })

  it('returns empty when previous meta has no pages', () => {
    const current: PageHashMeta[] = [
      { route: '/', hash: 'abc123' },
    ]
    const prev = {
      buildId: 'old',
      pageCount: 0,
      createdAt: '2025-01-01',
    } as BuildMeta

    const result = comparePageHashes(current, prev)
    expect(result.changed).toEqual([])
    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
  })
})

describe('static-indexnow: submission flow', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips on first deploy (no previous meta)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const result = await handleStaticIndexNow(
      [{ route: '/', hash: 'abc123' }],
      'https://example.com',
      'test-key',
      mockFetch,
    )

    expect(result).toEqual({ skipped: 'first_deploy' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('skips when key file not live', async () => {
    // First call: pages.meta.json exists
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        buildId: 'old',
        pageCount: 1,
        createdAt: '2025-01-01',
        pages: [{ route: '/', hash: 'old-hash' }],
      }),
    })
    // Second call: key.txt not found
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const result = await handleStaticIndexNow(
      [{ route: '/', hash: 'new-hash' }],
      'https://example.com',
      'test-key',
      mockFetch,
    )

    expect(result).toEqual({ skipped: 'key_not_live' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('skips when no content changes', async () => {
    // pages.meta.json with same hashes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        buildId: 'old',
        pageCount: 1,
        createdAt: '2025-01-01',
        pages: [{ route: '/', hash: 'abc123' }],
      }),
    })
    // key.txt exists
    mockFetch.mockResolvedValueOnce({ ok: true })

    const result = await handleStaticIndexNow(
      [{ route: '/', hash: 'abc123' }],
      'https://example.com',
      'test-key',
      mockFetch,
    )

    expect(result).toEqual({ skipped: 'no_changes' })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('submits changed pages to IndexNow', async () => {
    // pages.meta.json with old hashes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        buildId: 'old',
        pageCount: 2,
        createdAt: '2025-01-01',
        pages: [
          { route: '/', hash: 'old-hash' },
          { route: '/about', hash: 'about-hash' },
        ],
      }),
    })
    // key.txt exists
    mockFetch.mockResolvedValueOnce({ ok: true })
    // IndexNow submission succeeds
    mockFetch.mockResolvedValueOnce({ ok: true })

    const result = await handleStaticIndexNow(
      [
        { route: '/', hash: 'NEW-hash' },
        { route: '/about', hash: 'about-hash' },
        { route: '/new-page', hash: 'new123' },
      ],
      'https://example.com',
      'test-key',
      mockFetch,
    )

    expect(result).toEqual({ success: true, submitted: 2 })
    expect(mockFetch).toHaveBeenCalledTimes(3)

    // Verify IndexNow request
    const indexNowCall = mockFetch.mock.calls[2]
    expect(indexNowCall?.[0]).toBe('https://api.indexnow.org/indexnow')
    expect(indexNowCall?.[1]?.method).toBe('POST')

    const body = JSON.parse(indexNowCall?.[1]?.body as string)
    expect(body.host).toBe('example.com')
    expect(body.key).toBe('test-key')
    expect(body.urlList).toContain('https://example.com/')
    expect(body.urlList).toContain('https://example.com/new-page')
    expect(body.urlList).not.toContain('https://example.com/about')
  })

  it('handles IndexNow submission failure', async () => {
    // pages.meta.json
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        buildId: 'old',
        pageCount: 1,
        createdAt: '2025-01-01',
        pages: [{ route: '/', hash: 'old' }],
      }),
    })
    // key.txt exists
    mockFetch.mockResolvedValueOnce({ ok: true })
    // IndexNow fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    })

    const result = await handleStaticIndexNow(
      [{ route: '/', hash: 'new' }],
      'https://example.com',
      'test-key',
      mockFetch,
    )

    expect(result).toEqual({ skipped: 'submission_failed', error: 'HTTP 429' })
  })

  it('handles network errors gracefully', async () => {
    // pages.meta.json fetch fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await handleStaticIndexNow(
      [{ route: '/', hash: 'abc123' }],
      'https://example.com',
      'test-key',
      mockFetch,
    )

    expect(result).toEqual({ skipped: 'first_deploy' })
  })
})

describe('static-indexnow: URL construction', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('constructs correct URLs for submission', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        buildId: 'old',
        pageCount: 1,
        createdAt: '2025-01-01',
        pages: [{ route: '/docs/guide', hash: 'old' }],
      }),
    })
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockFetch.mockResolvedValueOnce({ ok: true })

    await handleStaticIndexNow(
      [
        { route: '/docs/guide', hash: 'new' },
        { route: '/blog/post-1', hash: 'post' },
      ],
      'https://my-site.com',
      'my-key',
      mockFetch,
    )

    const body = JSON.parse(mockFetch.mock.calls[2]?.[1]?.body as string)
    expect(body.host).toBe('my-site.com')
    expect(body.keyLocation).toBe('https://my-site.com/my-key.txt')
    expect(body.urlList).toEqual([
      'https://my-site.com/docs/guide',
      'https://my-site.com/blog/post-1',
    ])
  })
})
