import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assets: {} as Record<string, unknown>,
  importDbDump: vi.fn(),
}))

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': { debug: false } }),
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('../../src/runtime/server/utils/cloudflare', () => ({
  fetchPublicAsset: async (_event: unknown, path: string) => mocks.assets[path] ?? null,
}))

vi.mock('../../src/runtime/server/db', () => ({
  countPages: async () => 0,
  getContentHashes: async () => new Map(),
  getInfoValue: async () => null,
  markRoutesPending: async () => {},
  resetSitemapErrors: async () => 0,
  setInfoValue: async () => {},
  useRawDb: async () => ({}),
}))

vi.mock('../../src/runtime/server/db/shared', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/runtime/server/db/shared')>(),
  importDbDump: mocks.importDbDump,
}))

describe('checkAndHandleStale', () => {
  beforeEach(() => {
    mocks.assets = {}
    mocks.importDbDump.mockReset()
  })

  it('treats a response that is not build metadata as no dump', async () => {
    // A base URL redirect answers the metadata path with an HTML shell.
    mocks.assets['/__ai-ready/pages.meta.json'] = 'Redirecting...'
    mocks.assets['/__ai-ready/pages.dump'] = 'Redirecting...'
    const { checkAndHandleStale } = await import('../../src/runtime/server/utils/checkStale')

    await expect(checkAndHandleStale()).resolves.toMatchObject({ action: 'none', reason: 'no_dump_metadata' })
    expect(mocks.importDbDump).not.toHaveBeenCalled()
  })

  it('reports an unreadable dump without throwing', async () => {
    mocks.assets['/__ai-ready/pages.meta.json'] = { buildId: 'b1', pageCount: 1, createdAt: '2026-01-01' }
    mocks.assets['/__ai-ready/pages.dump'] = 'not a gzip payload'
    const { checkAndHandleStale } = await import('../../src/runtime/server/utils/checkStale')

    await expect(checkAndHandleStale()).resolves.toMatchObject({ action: 'none', reason: 'dump_fetch_failed' })
    expect(mocks.importDbDump).not.toHaveBeenCalled()
  })
})
