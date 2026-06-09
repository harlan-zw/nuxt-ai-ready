import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWritableDbPath } from '../../src/runtime/server/db/drizzle/providers/dbPath'

const { warn, mkdir } = vi.hoisted(() => ({ warn: vi.fn(), mkdir: vi.fn() }))

// Break the circular virtual logger alias used in unit tests.
vi.mock('#ai-ready-virtual/logger.mjs', () => ({
  logger: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('node:fs/promises', () => ({ mkdir }))

describe('resolveWritableDbPath', () => {
  afterEach(() => {
    mkdir.mockReset()
    warn.mockReset()
  })

  it('returns the configured path when the directory is writable', async () => {
    mkdir.mockResolvedValue(undefined)

    const result = await resolveWritableDbPath('.data/ai-ready/pages.db')

    expect(result).toBe('.data/ai-ready/pages.db')
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to a temp dir on a read-only filesystem (EROFS)', async () => {
    const fallback = join(tmpdir(), 'ai-ready', 'pages.db')
    mkdir.mockImplementation(async (dir: string) => {
      if (dir === '.data/ai-ready') {
        const err: any = new Error('read-only')
        err.code = 'EROFS'
        throw err
      }
      // tmp dir creation succeeds
    })

    const result = await resolveWritableDbPath('.data/ai-ready/pages.db')

    expect(result).toBe(fallback)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('falls back on a permission error (EACCES)', async () => {
    const fallback = join(tmpdir(), 'ai-ready', 'pages.db')
    mkdir.mockImplementation(async (dir: string) => {
      if (dir === '.data/ai-ready') {
        const err: any = new Error('permission denied')
        err.code = 'EACCES'
        throw err
      }
    })

    const result = await resolveWritableDbPath('.data/ai-ready/pages.db')

    expect(result).toBe(fallback)
  })

  it('rethrows non-recoverable errors instead of silently falling back', async () => {
    mkdir.mockImplementation(async () => {
      const err: any = new Error('disk full')
      err.code = 'ENOSPC'
      throw err
    })

    await expect(resolveWritableDbPath('.data/ai-ready/pages.db')).rejects.toThrow('disk full')
  })

  it('throws an actionable error when the temp dir fallback also fails', async () => {
    mkdir.mockImplementation(async () => {
      const err: any = new Error('read-only')
      err.code = 'EROFS'
      throw err
    })

    await expect(resolveWritableDbPath('.data/ai-ready/pages.db'))
      .rejects
      .toThrow(/temp dir fallback.*also failed/)
  })
})
