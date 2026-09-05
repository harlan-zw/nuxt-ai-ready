import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The cron task runs with no request context and no handler above it, so a
 * throw reaches Cloudflare as `scriptThrewException`: no stage, no message,
 * nothing a host can report. These cover the boundary that keeps that from
 * happening.
 */

const config = {
  debug: false,
  runtimeSync: { enabled: true, ttl: 3600, batchSize: 10 },
}

const tryAcquireCronLock = vi.fn()
const releaseCronLock = vi.fn(async () => {})
const getCronFastPathStatus = vi.fn()

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
  defineTask: (task: unknown) => task,
}))

vi.mock('../../src/runtime/server/db/queries', () => ({
  tryAcquireCronLock: (...args: unknown[]) => tryAcquireCronLock(...args),
  releaseCronLock: (...args: unknown[]) => releaseCronLock(...args),
  getCronFastPathStatus: (...args: unknown[]) => getCronFastPathStatus(...args),
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

const { runCron } = await import('../../src/runtime/server/utils/runCron')

describe('cron failure boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tryAcquireCronLock.mockResolvedValue(true)
    // A settled site with nothing to do, so the run takes the fast path and
    // finishes without touching the rest of the query surface.
    getCronFastPathStatus.mockResolvedValue({
      totalPages: 10,
      pendingPages: 0,
      lastStaleCheck: Date.now(),
      buildId: 'build',
      sitemapsNeedCrawl: 0,
    })
  })

  it('reports a database failure while taking the lock instead of throwing', async () => {
    tryAcquireCronLock.mockRejectedValue(new Error('D1_ERROR: no such table'))

    const result = await runCron(undefined)

    expect(result.failed).toEqual({
      stage: 'lock',
      message: 'Could not acquire the cron lock',
    })
  })

  it('does not release a lock it never took', async () => {
    tryAcquireCronLock.mockRejectedValue(new Error('D1_ERROR'))

    await runCron(undefined)

    expect(releaseCronLock).not.toHaveBeenCalled()
  })

  it('reports a failure raised after the lock was taken', async () => {
    getCronFastPathStatus.mockRejectedValue(new Error('D1_ERROR: connection lost'))

    const result = await runCron(undefined)

    expect(result.failed?.stage).toBe('run')
    expect(result.failed?.message).toContain('connection lost')
  })

  it('releases the lock when the run fails after taking it', async () => {
    getCronFastPathStatus.mockRejectedValue(new Error('D1_ERROR'))

    await runCron(undefined)

    expect(releaseCronLock).toHaveBeenCalled()
  })

  it('reports a thrown non-Error without assuming its shape', async () => {
    getCronFastPathStatus.mockRejectedValue('a bare string')

    const result = await runCron(undefined)

    expect(result.failed?.message).toBe('a bare string')
  })

  it('leaves a healthy run unmarked', async () => {
    const result = await runCron(undefined)

    expect(result.failed).toBeUndefined()
    expect(result.stale?.reason).toBe('fast_path_no_work')
  })

  it('skips without reporting a failure when another run holds the lock', async () => {
    tryAcquireCronLock.mockResolvedValue(false)

    const result = await runCron(undefined)

    expect(result.failed).toBeUndefined()
    expect(result.stale?.reason).toBe('lock_held')
  })
})
