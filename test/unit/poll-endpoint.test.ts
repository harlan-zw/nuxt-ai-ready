import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The poll endpoint shares the cron lock with scheduled runs. Without the
 * guard, a poll and a cron run fetch the same pending rows and index every
 * page twice.
 */

const { tryAcquireCronLock, releaseCronLock, batchIndexPages, config } = vi.hoisted(() => ({
  tryAcquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  batchIndexPages: vi.fn(),
  config: {
    debug: false,
    runtimeSync: { enabled: true, ttl: 3600, batchSize: 10 },
  } as Record<string, unknown>,
}))

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
}))

vi.mock('../../src/runtime/server/db/queries', () => ({
  tryAcquireCronLock,
  releaseCronLock,
}))

vi.mock('../../src/runtime/server/utils/batchIndex', () => ({
  batchIndexPages,
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { default: pollEndpoint } = await import('../../src/runtime/server/routes/__ai-ready/poll.post')

const app = createApp()
app.use(pollEndpoint)
const request = toWebHandler(app)

async function postPoll(url = 'http://localhost/__ai-ready/poll') {
  const response = await request(new Request(url, { method: 'POST' }))
  return { status: response.status, body: await response.json() }
}

describe('pOST /__ai-ready/poll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete config.runtimeSyncSecret
    tryAcquireCronLock.mockResolvedValue({ _tag: 'acquired', token: 'lock-token' })
    releaseCronLock.mockResolvedValue(undefined)
    batchIndexPages.mockResolvedValue({
      indexed: 2,
      remaining: 0,
      errors: [],
      duration: 5,
      complete: true,
    })
  })

  it('answers 409 with locked: true while another run holds the lock', async () => {
    tryAcquireCronLock.mockResolvedValue({ _tag: 'held' })

    const { status, body } = await postPoll()

    expect(status).toBe(409)
    expect(body).toEqual({ locked: true })
    expect(batchIndexPages).not.toHaveBeenCalled()
    expect(releaseCronLock).not.toHaveBeenCalled()
  })

  it('indexes and releases the lock on the normal path', async () => {
    const { status, body } = await postPoll('http://localhost/__ai-ready/poll?limit=5&all=true')

    expect(status).toBe(200)
    expect(body).toEqual({
      indexed: 2,
      remaining: 0,
      duration: 5,
      complete: true,
    })
    expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 5, all: true, timeout: undefined })
    expect(releaseCronLock).toHaveBeenCalledWith(expect.anything(), 'lock-token')
  })

  it('releases the lock when indexing throws', async () => {
    batchIndexPages.mockRejectedValue(new Error('D1_ERROR: connection lost'))

    const { status } = await postPoll()

    expect(status).toBe(500)
    expect(releaseCronLock).toHaveBeenCalledWith(expect.anything(), 'lock-token')
  })

  it('checks auth before touching the lock', async () => {
    config.runtimeSyncSecret = 'secret-token'

    const denied = await postPoll()

    expect(denied.status).toBe(401)
    expect(tryAcquireCronLock).not.toHaveBeenCalled()
    expect(batchIndexPages).not.toHaveBeenCalled()

    const allowed = await request(new Request('http://localhost/__ai-ready/poll', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token' },
    }))

    expect(allowed.status).toBe(200)
    expect(tryAcquireCronLock).toHaveBeenCalledTimes(1)
  })
})
