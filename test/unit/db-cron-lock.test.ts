import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
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

const { buildSchemaSql } = await import('../../src/runtime/server/db/schema-sql')

function makeSqlite() {
  const db = new Database(':memory:')
  for (const stmt of buildSchemaSql())
    db.exec(stmt)
  return {
    db,
    adapter: {
      async exec(sql: string, params: unknown[] = []) {
        db.prepare(sql).run(...params)
      },
      async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
        return db.prepare(sql).get(...params) as T | undefined
      },
      async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        return db.prepare(sql).all(...params) as T[]
      },
    },
  }
}

function setLockValue(db: Database.Database, value: string) {
  db.prepare(`INSERT INTO _ai_ready_info (id, value) VALUES ('cron_lock', ?)
    ON CONFLICT(id) DO UPDATE SET value = excluded.value`).run(value)
}

function getLockValue(db: Database.Database): string | undefined {
  return (db.prepare(`SELECT value FROM _ai_ready_info WHERE id = 'cron_lock'`).get() as { value: string } | undefined)?.value
}

function backdateLock(db: Database.Database, ageMs: number) {
  const raw = getLockValue(db)
  if (!raw)
    throw new Error('No lock to backdate')
  const lock = JSON.parse(raw) as { t: string, a: number, e: number }
  setLockValue(db, JSON.stringify({ ...lock, a: lock.a - ageMs, e: lock.e - ageMs }))
}

let sqlite: ReturnType<typeof makeSqlite>

async function importQueries() {
  return await import('../../src/runtime/server/db/queries')
}

describe('cron lock ownership', () => {
  beforeEach(() => {
    vi.resetModules()
    sqlite?.db.close()
    sqlite = makeSqlite()
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue(sqlite.adapter)
  })

  it('admits exactly one owner for two acquires in the same millisecond', async () => {
    const { tryAcquireCronLock } = await importQueries()

    const first = await tryAcquireCronLock(undefined)
    const second = await tryAcquireCronLock(undefined)

    expect(first._tag).toBe('acquired')
    expect(second._tag).toBe('held')
    if (first._tag !== 'acquired')
      throw new Error('unreachable')
    expect(getLockValue(sqlite.db)).toContain(first.token)
  })

  it('acquires again after the previous lock expired', async () => {
    const { tryAcquireCronLock } = await importQueries()

    const first = await tryAcquireCronLock(undefined)
    if (first._tag !== 'acquired')
      throw new Error('unreachable')
    backdateLock(sqlite.db, 300_001)

    const second = await tryAcquireCronLock(undefined)

    expect(second._tag).toBe('acquired')
    if (second._tag !== 'acquired')
      throw new Error('unreachable')
    expect(second.token).not.toBe(first.token)
  })

  it('does not delete the new owner when releasing a stolen lock with the old token', async () => {
    const { tryAcquireCronLock, releaseCronLock, getCronLockStatus } = await importQueries()

    const slow = await tryAcquireCronLock(undefined)
    if (slow._tag !== 'acquired')
      throw new Error('unreachable')
    backdateLock(sqlite.db, 300_001)
    const thief = await tryAcquireCronLock(undefined)
    if (thief._tag !== 'acquired')
      throw new Error('unreachable')

    await releaseCronLock(undefined, slow.token)

    expect(getLockValue(sqlite.db)).toContain(thief.token)
    expect(await getCronLockStatus(undefined)).toMatchObject({ held: true, stale: false })

    await releaseCronLock(undefined, thief.token)

    expect(getLockValue(sqlite.db)).toBeUndefined()
  })

  it('reports held, since, elapsed and stale from the stored lock', async () => {
    const { tryAcquireCronLock, getCronLockStatus } = await importQueries()

    const before = Date.now()
    const lock = await tryAcquireCronLock(undefined)
    if (lock._tag !== 'acquired')
      throw new Error('unreachable')

    const status = await getCronLockStatus(undefined)
    expect(status.held).toBe(true)
    expect(status.stale).toBe(false)
    expect(status.since).toBeGreaterThanOrEqual(before)
    expect(status.elapsedMs).toBeGreaterThanOrEqual(0)

    backdateLock(sqlite.db, 300_001)
    expect(await getCronLockStatus(undefined)).toMatchObject({ held: false, stale: true })
  })

  it('takes over a legacy numeric lock value without blocking', async () => {
    const { tryAcquireCronLock, getCronLockStatus } = await importQueries()

    const legacyAt = Date.now() - 600_000
    setLockValue(sqlite.db, String(legacyAt))

    expect(await getCronLockStatus(undefined)).toMatchObject({ held: false, stale: true, since: legacyAt })

    const lock = await tryAcquireCronLock(undefined)
    expect(lock._tag).toBe('acquired')
    expect(await getCronLockStatus(undefined)).toMatchObject({ held: true, stale: false })
  })
})
