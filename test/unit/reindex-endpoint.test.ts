import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, toWebHandler } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const config = {
  runtimeSyncSecret: 'test-secret',
  runtimeSync: { enabled: true, ttl: 3600, batchSize: 10 },
  mdreamOptions: {},
  database: { filename: '' },
}

const { fetchWithEvent } = vi.hoisted(() => ({ fetchWithEvent: vi.fn() }))

vi.mock('#nuxtseo/nitro', () => ({
  fetchWithEvent,
  useEvent: () => {
    throw new Error('No active event')
  },
  useNitroApp: () => ({ hooks: { callHook: vi.fn() } }),
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config, 'site': { url: 'https://example.com' } }),
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() },
}))

const { default: reindexEndpoint } = await import('../../src/runtime/server/routes/__ai-ready/reindex.post')
const { getPageIndexState, queryPages } = await import('../../src/runtime/server/db/queries')

const app = createApp()
app.use(reindexEndpoint)
const request = toWebHandler(app)

const html = (title: string) => `<!DOCTYPE html><html><head><title>${title}</title><meta name="description" content="About the site"></head><body><h1>${title}</h1><p>Welcome to the site.</p></body></html>`

function readerEvent() {
  return { context: {} } as Parameters<typeof queryPages>[0]
}

async function reindex(query = '', token: string | null = 'test-secret') {
  const response = await request(new Request(`http://localhost/__ai-ready/reindex${query}`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }))
  return { status: response.status, body: await response.json() }
}

describe('pOST /__ai-ready/reindex', () => {
  beforeAll(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-reindex-'))
    config.database.filename = join(directory, 'pages.db')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    fetchWithEvent.mockReset()
  })

  it('rejects a request without a bearer token', async () => {
    const { status } = await reindex('?route=/about', null)

    expect(status).toBe(401)
    expect(fetchWithEvent).not.toHaveBeenCalled()
  })

  it('rejects an invalid route with 400', async () => {
    const missing = await reindex()
    expect(missing.status).toBe(400)

    const relative = await reindex('?route=about')
    expect(relative.status).toBe(400)

    expect(fetchWithEvent).not.toHaveBeenCalled()
  })

  it('indexes the route and stores the page in the database', async () => {
    fetchWithEvent.mockResolvedValue(html('About'))

    const { status, body } = await reindex('?route=/about')

    expect(status).toBe(200)
    expect(body).toMatchObject({ route: '/about', indexed: true })
    expect(fetchWithEvent).toHaveBeenCalledWith(expect.anything(), '/about', expect.objectContaining({
      headers: expect.objectContaining({ accept: 'text/html' }),
    }))

    const page = await queryPages(readerEvent(), { route: '/about' })
    expect(page?.title).toBe('About')

    const state = await getPageIndexState(readerEvent(), '/about')
    expect(state?.indexedAt).toBeGreaterThan(0)
  })

  it('reports a fetch failure without crashing and writes nothing', async () => {
    fetchWithEvent.mockRejectedValue(new Error('connect ECONNREFUSED'))

    const { status, body } = await reindex('?route=/missing')

    expect(status).toBe(502)
    expect(body).toMatchObject({ route: '/missing', indexed: false })
    expect(body.error).toContain('Failed to fetch HTML for /missing')

    const page = await queryPages(readerEvent(), { route: '/missing' })
    expect(page).toBeUndefined()

    fetchWithEvent.mockResolvedValue(html('Back up'))
    const recovery = await reindex('?route=/missing')
    expect(recovery.status).toBe(200)
    expect(recovery.body.indexed).toBe(true)
  })

  it('skips a fresh page when force is false', async () => {
    fetchWithEvent.mockResolvedValue(html('About'))

    await reindex('?route=/about')
    const skipped = await reindex('?route=/about&force=false')

    expect(skipped.status).toBe(200)
    expect(skipped.body).toMatchObject({ route: '/about', indexed: false, skipped: true })
  })
})
