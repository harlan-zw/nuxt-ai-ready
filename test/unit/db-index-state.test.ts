import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPageIndexState } from '../../src/runtime/server/db/queries'

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
    mocks.first.mockReset()
    mocks.initSchema.mockReset()
    mocks.useRawDb.mockReset()
    mocks.useRawDb.mockResolvedValue({ first: mocks.first })
  })

  it('maps storage column names without relying on case-sensitive aliases', async () => {
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
})
