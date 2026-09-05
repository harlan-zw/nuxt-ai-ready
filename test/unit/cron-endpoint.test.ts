import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Platform cron monitors judge a run by the HTTP status of
 * GET /__ai-ready/cron. A failed run must answer with an error
 * status, not a 200 with the failure buried in the body.
 */

const config = {
  debug: false,
  runtimeSync: { enabled: true, ttl: 3600, batchSize: 10 },
}

const { tryAcquireCronLock, releaseCronLock, getCronFastPathStatus } = vi.hoisted(() => ({
  tryAcquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  getCronFastPathStatus: vi.fn(),
}))

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
}))

vi.mock('../../src/runtime/server/db/queries', () => ({
  tryAcquireCronLock,
  releaseCronLock,
  getCronFastPathStatus,
  completeCronRun: vi.fn(),
  getNextSitemapToCrawl: vi.fn(),
  markSitemapCrawled: vi.fn(),
  markSitemapCrawlPartial: vi.fn(),
  markSitemapError: vi.fn(),
  pruneCronRunsByAge: vi.fn(),
  pruneStaleRoutes: vi.fn(),
  seedRoutes: vi.fn(),
  startCronRun: vi.fn(),
  syncSitemaps: vi.fn(),
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: cronEndpoint } = await import('../../src/runtime/server/routes/__ai-ready/cron.get')

const app = createApp()
app.use(cronEndpoint)
const request = toWebHandler(app)

async function getCron() {
  const response = await request(new Request('http://localhost/__ai-ready/cron'))
  return { status: response.status, body: await response.json() }
}

describe('gET /__ai-ready/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    releaseCronLock.mockResolvedValue(undefined)
    tryAcquireCronLock.mockResolvedValue(true)
    // A settled site with nothing to do, so a healthy run finishes on the
    // fast path without touching the rest of the query surface.
    getCronFastPathStatus.mockResolvedValue({
      totalPages: 10,
      pendingPages: 0,
      lastStaleCheck: Date.now(),
      buildId: 'build',
      sitemapsNeedCrawl: 0,
    })
  })

  it('answers a lock failure with an error status carrying the failure message', async () => {
    tryAcquireCronLock.mockRejectedValue(new Error('D1_ERROR: no such table'))

    const { status, body } = await getCron()

    expect(status).toBe(500)
    expect(body.data?.message).toBe('Could not acquire the cron lock')
  })

  it('answers a run failure with an error status carrying the failure message', async () => {
    getCronFastPathStatus.mockRejectedValue(new Error('D1_ERROR: connection lost'))

    const { status, body } = await getCron()

    expect(status).toBe(500)
    expect(body.data?.message).toContain('connection lost')
  })

  it('answers a healthy run with 200 and the run result', async () => {
    const { status, body } = await getCron()

    expect(status).toBe(200)
    expect(body.failed).toBeUndefined()
    expect(body.stale?.reason).toBe('fast_path_no_work')
  })

  it('answers a skipped run with 200 when another run holds the lock', async () => {
    tryAcquireCronLock.mockResolvedValue(false)

    const { status, body } = await getCron()

    expect(status).toBe(200)
    expect(body.failed).toBeUndefined()
    expect(body.stale?.reason).toBe('lock_held')
  })
})
