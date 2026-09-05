import { describe, expect, it } from 'vitest'
import { getRawExecutor, registerDriver } from '../../src/runtime/server/db/drizzle/raw'

type DrizzleClient = Parameters<typeof getRawExecutor>[0]

function fakeClient(db: Record<string, unknown>): DrizzleClient {
  return { dialect: 'postgres', db: db as unknown as DrizzleClient['db'] } as DrizzleClient
}

function batchQueries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    sql: 'UPDATE ai_ready_pages SET indexed = ? WHERE route = ?',
    params: [0, `/r${i}`],
  }))
}

describe('raw executor neon batch', () => {
  it('routes statements through the transaction handle, never the eager query path', async () => {
    const eager: string[] = []
    const txQueries: { sql: string, params: unknown[] }[] = []
    const chunkSizes: number[] = []
    const driver = {
      query: (sql: string, _params: unknown[]) => {
        eager.push(sql)
        return Promise.resolve([])
      },
      transaction: async (run: (tx: unknown) => unknown[]) => {
        const descriptors = run({
          query: (sql: string, params: unknown[]) => {
            txQueries.push({ sql, params })
            return { lazy: true }
          },
        })
        chunkSizes.push(descriptors.length)
        return descriptors
      },
    }
    const dbKey = {} as Record<string, unknown>
    const client = fakeClient(dbKey)
    registerDriver(client.db, 'neon', driver)

    await getRawExecutor(client).batch(batchQueries(250))

    expect(eager).toEqual([])
    expect(chunkSizes).toEqual([100, 100, 50])
    expect(txQueries).toHaveLength(250)
    expect(txQueries[0]).toEqual({
      sql: 'UPDATE ai_ready_pages SET indexed = $1 WHERE route = $2',
      params: [0, '/r0'],
    })
  })

  it('propagates transaction failures', async () => {
    const driver = {
      query: () => Promise.resolve([]),
      transaction: async () => {
        throw new Error('neon unavailable')
      },
    }
    const dbKey = {} as Record<string, unknown>
    const client = fakeClient(dbKey)
    registerDriver(client.db, 'neon', driver)

    await expect(getRawExecutor(client).batch(batchQueries(2)))
      .rejects
      .toThrow('neon unavailable')
  })

  it('submits one transactional HTTP request per chunk with the real neon driver', async () => {
    const requests: { queries: Array<{ query: string, params: unknown[] }> }[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: unknown, opts: { body: string }) => {
      const body = JSON.parse(opts.body)
      requests.push(body)
      const count = Array.isArray(body.queries) ? body.queries.length : 1
      return new Response(JSON.stringify({
        results: Array.from({ length: count }, () => ({ fields: [], rows: [] })),
      }), { status: 200 })
    }) as unknown as typeof fetch

    try {
      const { neon } = await import('@neondatabase/serverless')
      const sqlFn = neon('postgres://user:pass@host.tld/dbname')
      const dbKey = {} as Record<string, unknown>
      const client = fakeClient(dbKey)
      registerDriver(client.db, 'neon', sqlFn)

      await getRawExecutor(client).batch(batchQueries(3))

      expect(requests).toHaveLength(1)
      expect(requests[0]!.queries.map((q: { query: string }) => q.query)).toEqual([
        'UPDATE ai_ready_pages SET indexed = $1 WHERE route = $2',
        'UPDATE ai_ready_pages SET indexed = $1 WHERE route = $2',
        'UPDATE ai_ready_pages SET indexed = $1 WHERE route = $2',
      ])
      expect(requests[0]!.queries.map((q: { params: unknown[] }) => q.params[1])).toEqual(['/r0', '/r1', '/r2'])
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })
})
