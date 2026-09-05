import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: { runtimeSync: { enabled: boolean, ttl: number, batchSize?: number } } = {
  runtimeSync: { enabled: true, ttl: 3600, batchSize: 25 },
}

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
}))

const { requireAuth } = vi.hoisted(() => ({ requireAuth: vi.fn() }))
vi.mock('../../src/runtime/server/utils/auth', () => ({ requireAuth }))

const { batchIndexPages } = vi.hoisted(() => ({ batchIndexPages: vi.fn() }))
vi.mock('../../src/runtime/server/utils/batchIndex', () => ({ batchIndexPages }))

const { default: pollEndpoint } = await import('../../src/runtime/server/routes/__ai-ready/poll.post')

const app = createApp()
app.use(pollEndpoint)
const request = toWebHandler(app)

async function poll(query = '') {
  const response = await request(new Request(`http://localhost/__ai-ready/poll${query}`, { method: 'POST' }))
  return { status: response.status, body: await response.json() }
}

describe('pOST /__ai-ready/poll limit defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuth.mockReturnValue(undefined)
    batchIndexPages.mockResolvedValue({ indexed: 0, remaining: 0, errors: [], duration: 1, complete: true })
  })

  it('defaults the batch size to runtimeSync.batchSize', async () => {
    const { status } = await poll()
    expect(status).toBe(200)
    expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 25, all: false, timeout: undefined })
  })

  it('keeps an explicit limit over the configured batch size', async () => {
    await poll('?limit=5')
    expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 5, all: false, timeout: undefined })
  })

  it('caps an explicit limit at 50', async () => {
    await poll('?limit=500')
    expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 50, all: false, timeout: undefined })
  })

  it('falls back to the configured batch size for an invalid limit', async () => {
    await poll('?limit=abc')
    expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 25, all: false, timeout: undefined })
  })

  it('falls back to 10 when no batch size is configured', async () => {
    config.runtimeSync.batchSize = undefined
    try {
      await poll()
      expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 10, all: false, timeout: undefined })
    }
    finally {
      config.runtimeSync.batchSize = 25
    }
  })

  it('still caps the configured batch size at 50', async () => {
    config.runtimeSync.batchSize = 500
    try {
      await poll()
      expect(batchIndexPages).toHaveBeenCalledWith(expect.anything(), { limit: 50, all: false, timeout: undefined })
    }
    finally {
      config.runtimeSync.batchSize = 25
    }
  })
})
