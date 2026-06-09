import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWritableDbPath } from '../../src/runtime/server/db/drizzle/providers/dbPath'

const { warn, mkdir, writeFile, rm } = vi.hoisted(() => ({
  warn: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
}))

// Break the circular virtual logger alias used in unit tests.
vi.mock('#ai-ready-virtual/logger.mjs', () => ({
  logger: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('node:fs/promises', () => ({ mkdir, writeFile, rm }))

// Expected app-namespaced fallback for a given configured db path.
function expectedFallback(dbPath: string): string {
  const key = createHash('sha256').update(resolve(dbPath)).digest('hex').slice(0, 16)
  return join(tmpdir(), `ai-ready-${key}`, 'pages.db')
}

const rofs = (msg = 'read-only') => Object.assign(new Error(msg), { code: 'EROFS' })

describe('resolveWritableDbPath', () => {
  afterEach(() => {
    mkdir.mockReset()
    writeFile.mockReset()
    rm.mockReset()
    warn.mockReset()
  })

  it('returns the configured path when the directory is writable', async () => {
    mkdir.mockResolvedValue(undefined)
    writeFile.mockResolvedValue(undefined)
    rm.mockResolvedValue(undefined)

    // unique path per test to avoid the module-level memo cache
    const result = await resolveWritableDbPath('.writable/ai-ready/pages.db')

    expect(result).toBe('.writable/ai-ready/pages.db')
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to an app-namespaced temp dir on a read-only filesystem (EROFS)', async () => {
    const dbPath = '.erofs/ai-ready/pages.db'
    // primary mkdir fails read-only; temp dir succeeds
    mkdir.mockImplementation(async (dir: string) =>
      dir.startsWith(tmpdir()) ? undefined : Promise.reject(rofs()))
    writeFile.mockResolvedValue(undefined)
    rm.mockResolvedValue(undefined)

    const result = await resolveWritableDbPath(dbPath)

    expect(result).toBe(expectedFallback(dbPath))
    expect(warn).toHaveBeenCalledOnce()
  })

  it('falls back when the dir exists but is not writable (mkdir succeeds, write probe fails)', async () => {
    // This is the case a plain mkdir check misses: a read-only bundle directory
    // already exists, so mkdir is a no-op, but a real write still fails.
    const dbPath = '.readonly-existing/ai-ready/pages.db'
    mkdir.mockResolvedValue(undefined)
    writeFile.mockImplementation(async (file: string) =>
      file.startsWith(tmpdir()) ? undefined : Promise.reject(rofs()))
    rm.mockResolvedValue(undefined)

    const result = await resolveWritableDbPath(dbPath)

    expect(result).toBe(expectedFallback(dbPath))
  })

  it('falls back on a permission error (EACCES)', async () => {
    const dbPath = '.eacces/ai-ready/pages.db'
    mkdir.mockImplementation(async (dir: string) =>
      dir.startsWith(tmpdir()) ? undefined : Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })))
    writeFile.mockResolvedValue(undefined)
    rm.mockResolvedValue(undefined)

    const result = await resolveWritableDbPath(dbPath)

    expect(result).toBe(expectedFallback(dbPath))
  })

  it('gives distinct fallback dirs to distinct configured paths', async () => {
    mkdir.mockImplementation(async (dir: string) =>
      dir.startsWith(tmpdir()) ? undefined : Promise.reject(rofs()))
    writeFile.mockResolvedValue(undefined)
    rm.mockResolvedValue(undefined)

    const a = await resolveWritableDbPath('/app-a/.data/ai-ready/pages.db')
    const b = await resolveWritableDbPath('/app-b/.data/ai-ready/pages.db')

    expect(a).not.toBe(b)
  })

  it('rethrows non-recoverable errors instead of silently falling back', async () => {
    mkdir.mockRejectedValue(Object.assign(new Error('disk full'), { code: 'ENOSPC' }))

    await expect(resolveWritableDbPath('.enospc/ai-ready/pages.db')).rejects.toThrow('disk full')
  })

  it('throws an actionable error when the temp dir fallback also fails', async () => {
    // both primary and temp dir are read-only
    mkdir.mockResolvedValue(undefined)
    writeFile.mockRejectedValue(rofs())

    await expect(resolveWritableDbPath('.all-readonly/ai-ready/pages.db'))
      .rejects
      .toThrow(/temp dir fallback.*also failed/)
  })
})
