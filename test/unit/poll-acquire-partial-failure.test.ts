import Database from 'better-sqlite3'
import { createApp, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A partial DB failure while acquiring the poll lock must not strand the fresh
 * lock row. If the lock upsert lands but the ownership verify SELECT throws,
 * the handler dies before its try/finally, so nobody ever releases the token
 * and every cron/poll run is blocked until the 5 minute TTL expires.
 */

const mocks = vi.hoisted(() => ({
  initSchema: vi.fn(),
  useRawDb: vi.fn(),
  batchIndexPages: vi.fn(),
  config: {} as Record<string, unknown>,
}))

vi.mock('#nuxtseo/nitro', () => ({
  useEvent: () => {
    throw new Error('No active event')
  },
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': mocks.config }),
}))

vi.mock('../../src/runtime/server/db/drizzle/queries', () => ({
  initSchema: mocks.initSchema,
}))

vi.mock('../../src/runtime/server/db/drizzle/raw', () => ({
  useRawDb: mocks.useRawDb,
}))

vi.mock('../../src/runtime/server/utils/batchIndex', () => ({
  batchIndexPages: mocks.batchIndexPages,
}))

vi.mock('../../src/runtime/server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { default: pollEndpoint } = await import('../../src/runtime/server/routes/__ai-ready/poll.post')

const app = createApp()
app.use(pollEndpoint)
const request = toWebHandler(app)

let sqlite: Database.Database
let failVerifyReads: boolean

function makeAdapter(db: Database.Database) {
  return {
    async exec(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params)
    },
    async first<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      // The verify read in tryAcquireCronLock is the only cron_lock SELECT
      // that carries a second condition after the id.
      if (failVerifyReads && sql.includes(`id = 'cron_lock' AND`))
        throw new Error('transient verify failure')
      return db.prepare(sql).get(...params) as T | undefined
    },
    async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[]
    },
  }
}

function getLockValue(): string | undefined {
  return (sqlite.prepare(`SELECT value FROM _ai_ready_info WHERE id = 'cron_lock'`).get() as { value: string } | undefined)?.value
}

async function postPoll() {
  const response = await request(new Request('http://localhost/__ai-ready/poll', { method: 'POST' }))
  return { status: response.status, body: await response.json() }
}

describe('pOST /__ai-ready/poll with a failing lock verify read', () => {
  beforeEach(() => {
    vi.resetModules()
    sqlite?.close()
    sqlite = new Database(':memory:')
    for (const stmt of [
      'CREATE TABLE IF NOT EXISTS _ai_ready_info (id TEXT PRIMARY KEY, value TEXT)',
    ])
      sqlite.exec(stmt)
    failVerifyReads = false
    mocks.initSchema.mockReset().mockResolvedValue(undefined)
    mocks.useRawDb.mockReset().mockResolvedValue(makeAdapter(sqlite))
    mocks.batchIndexPages.mockReset().mockResolvedValue({
      indexed: 1,
      remaining: 0,
      errors: [],
      duration: 1,
      complete: true,
    })
    delete mocks.config.runtimeSyncSecret
  })

  it('best-effort releases the lock so a retry is not answered 409', async () => {
    failVerifyReads = true

    const failed = await postPoll()

    expect(failed.status).toBe(500)
    expect(getLockValue()).toBeUndefined()

    failVerifyReads = false
    const retry = await postPoll()

    expect(retry.status).not.toBe(409)
    expect(retry.status).toBe(200)
    expect(retry.body).toMatchObject({ indexed: 1, complete: true })
  })
})
