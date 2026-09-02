import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  first: vi.fn(),
  initSchema: vi.fn(),
  useRawDb: vi.fn(),
}))

vi.mock('../../src/runtime/server/db/drizzle/queries', () => ({
  initSchema: mocks.initSchema,
}))

vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({
  useRawDb: mocks.useRawDb,
}))

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: () => {
    throw new Error('No active event')
  },
  useRuntimeConfig: () => ({}),
}))

describe('getPageIndexState', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.first.mockReset()
    mocks.initSchema.mockReset()
    mocks.initSchema.mockResolvedValue(undefined)
    mocks.useRawDb.mockReset()
    mocks.useRawDb.mockResolvedValue({ first: mocks.first })
  })

  it('maps storage column names without relying on case-sensitive aliases', async () => {
    const { getPageIndexState } = await import('../../src/runtime/server/db/queries')
    mocks.first.mockResolvedValue({
      indexed_at: 123,
      content_hash: 'hash-123',
    })

    await expect(getPageIndexState(undefined, '/page')).resolves.toEqual({
      indexedAt: 123,
      contentHash: 'hash-123',
    })
    expect(mocks.first).toHaveBeenCalledWith(
      'SELECT indexed_at, content_hash FROM ai_ready_pages WHERE route = ?',
      ['/page'],
    )
  })

  it('shares schema initialization across parallel queries', async () => {
    let finishInitialization: (() => void) | undefined
    mocks.initSchema.mockImplementation(() => new Promise<void>((resolve) => {
      finishInitialization = resolve
    }))
    mocks.first.mockResolvedValue(undefined)
    const { getPageIndexState } = await import('../../src/runtime/server/db/queries')

    const queries = Array.from({ length: 5 }, () => getPageIndexState(undefined, '/page'))
    await vi.waitFor(() => expect(mocks.initSchema).toHaveBeenCalledTimes(1))
    finishInitialization?.()

    await expect(Promise.all(queries)).resolves.toEqual(Array.from({ length: 5 }).fill(undefined))
  })

  it('retries schema initialization after a failure', async () => {
    mocks.initSchema
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined)
    mocks.first.mockResolvedValue(undefined)
    const { getPageIndexState } = await import('../../src/runtime/server/db/queries')

    await expect(getPageIndexState(undefined, '/page')).rejects.toThrow('database unavailable')
    await expect(getPageIndexState(undefined, '/page')).resolves.toBeUndefined()

    expect(mocks.initSchema).toHaveBeenCalledTimes(2)
  })
})
