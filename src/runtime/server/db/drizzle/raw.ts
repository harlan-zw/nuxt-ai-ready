/**
 * Raw SQL execution utilities for Drizzle
 * Provides direct driver access for raw SQL queries
 */
import type { H3Event } from '#nuxtseo/h3'
import type { DrizzleDatabase } from './client'
import { useDrizzle } from './client'

// Store underlying driver references alongside Drizzle instance
const driverCache = new WeakMap<DrizzleDatabase['db'], {
  type: 'better-sqlite3' | 'node-sqlite' | 'libsql' | 'neon' | 'postgres' | 'd1'
  driver: unknown
}>()

/**
 * Register the underlying driver for raw SQL access
 */
export function registerDriver(
  db: DrizzleDatabase['db'],
  type: 'better-sqlite3' | 'node-sqlite' | 'libsql' | 'neon' | 'postgres' | 'd1',
  driver: unknown,
): void {
  driverCache.set(db, { type, driver })
}

const RE_PARAM_PLACEHOLDER = /\?/g

/**
 * Remote drivers pay a network round-trip per statement. Their batch or
 * transaction interface keeps chunks ordered and avoids oversized requests.
 * Local drivers wrap each batch in a transaction for the same interface.
 */
const MAX_BATCH_STATEMENTS = 100

function toPostgresQuery(query: string): string {
  let index = 0
  return query.replace(RE_PARAM_PLACEHOLDER, () => `$${++index}`)
}

/**
 * Get raw SQL executor for a Drizzle client
 */
export function getRawExecutor(client: DrizzleDatabase) {
  const cached = driverCache.get(client.db)
  if (!cached) {
    throw new Error('[ai-ready] Raw driver not registered. This is a bug.')
  }

  const { type, driver } = cached

  return {
    dialect: client.dialect,

    async all<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
      switch (type) {
        case 'better-sqlite3': {
          const db = driver as { prepare: (sql: string) => { all: (...p: unknown[]) => unknown[] } }
          return db.prepare(query).all(...params) as T[]
        }
        case 'node-sqlite': {
          const db = driver as { prepare: (sql: string) => { all: (...p: never[]) => unknown[] } }
          return db.prepare(query).all(...params as never[]) as T[]
        }
        case 'libsql': {
          const client = driver as { execute: (opts: { sql: string, args: unknown[] }) => Promise<{ rows: unknown[] }> }
          const result = await client.execute({ sql: query, args: params })
          return result.rows as T[]
        }
        case 'd1': {
          const db = driver as { prepare: (sql: string) => { bind: (...p: unknown[]) => { all: () => Promise<{ results: unknown[] }> } } }
          const result = await db.prepare(query).bind(...params).all()
          return result.results as T[]
        }
        case 'neon': {
          const sqlFn = driver as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] } | unknown[]> }
          const result = await sqlFn.query(toPostgresQuery(query), params)
          return ((result as any).rows || result) as T[]
        }
        case 'postgres': {
          const sqlClient = driver as { unsafe: (sql: string, params: unknown[]) => Promise<unknown[]> }
          return await sqlClient.unsafe(toPostgresQuery(query), params) as T[]
        }
      }
    },

    async first<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T | undefined> {
      const rows = await this.all<T>(query, params)
      return rows[0]
    },

    async exec(query: string, params: unknown[] = []): Promise<void> {
      switch (type) {
        case 'better-sqlite3': {
          const db = driver as { prepare: (sql: string) => { run: (...p: unknown[]) => void } }
          db.prepare(query).run(...params)
          break
        }
        case 'node-sqlite': {
          const db = driver as { prepare: (sql: string) => { run: (...p: never[]) => void } }
          db.prepare(query).run(...params as never[])
          break
        }
        case 'libsql': {
          const client = driver as { execute: (opts: { sql: string, args: unknown[] }) => Promise<void> }
          await client.execute({ sql: query, args: params })
          break
        }
        case 'd1': {
          const db = driver as { prepare: (sql: string) => { bind: (...p: unknown[]) => { run: () => Promise<void> } } }
          await db.prepare(query).bind(...params).run()
          break
        }
        case 'neon': {
          const sqlFn = driver as { query: (sql: string, params: unknown[]) => Promise<void> }
          await sqlFn.query(toPostgresQuery(query), params)
          break
        }
        case 'postgres': {
          const sqlClient = driver as { unsafe: (sql: string, params: unknown[]) => Promise<unknown> }
          await sqlClient.unsafe(toPostgresQuery(query), params)
          break
        }
      }
    },

    /**
     * Execute many statements in as few round-trips as the driver allows.
     * Statements run in order; on a remote driver each chunk is one request.
     */
    async batch(queries: { sql: string, params?: unknown[] }[]): Promise<void> {
      if (queries.length === 0)
        return

      switch (type) {
        case 'better-sqlite3': {
          const sqlite = driver as {
            prepare: (sql: string) => { run: (...p: unknown[]) => void }
            transaction: (fn: () => void) => () => void
          }
          const tx = sqlite.transaction(() => {
            for (const q of queries)
              sqlite.prepare(q.sql).run(...(q.params || []))
          })
          tx()
          break
        }
        case 'node-sqlite': {
          const sqlite = driver as {
            exec: (sql: string) => void
            prepare: (sql: string) => { run: (...p: never[]) => void }
          }
          sqlite.exec('BEGIN')
          try {
            for (const q of queries)
              sqlite.prepare(q.sql).run(...(q.params || []) as never[])
            sqlite.exec('COMMIT')
          }
          catch (error) {
            sqlite.exec('ROLLBACK')
            throw error
          }
          break
        }
        case 'libsql': {
          const client = driver as { batch: (stmts: { sql: string, args?: unknown[] }[]) => Promise<unknown> }
          for (let i = 0; i < queries.length; i += MAX_BATCH_STATEMENTS) {
            const chunk = queries.slice(i, i + MAX_BATCH_STATEMENTS)
            await client.batch(chunk.map(q => ({ sql: q.sql, args: q.params || [] })))
          }
          break
        }
        case 'd1': {
          const db = driver as {
            prepare: (sql: string) => { bind: (...p: unknown[]) => { run: () => Promise<unknown> } }
            batch: (stmts: unknown[]) => Promise<unknown>
          }
          for (let i = 0; i < queries.length; i += MAX_BATCH_STATEMENTS) {
            const chunk = queries.slice(i, i + MAX_BATCH_STATEMENTS)
            await db.batch(chunk.map(q => db.prepare(q.sql).bind(...(q.params || []))))
          }
          break
        }
        case 'neon': {
          const sqlFn = driver as {
            query: (sql: string, params: unknown[]) => Promise<unknown>
            transaction: (queries: unknown[]) => Promise<unknown>
          }
          for (let i = 0; i < queries.length; i += MAX_BATCH_STATEMENTS) {
            const chunk = queries.slice(i, i + MAX_BATCH_STATEMENTS)
            const pgQueries = chunk.map((q) => {
              return sqlFn.query(toPostgresQuery(q.sql), q.params || [])
            })
            await sqlFn.transaction(pgQueries)
          }
          break
        }
        case 'postgres': {
          interface TransactionClient {
            unsafe: (sql: string, params: unknown[]) => Promise<unknown>
          }
          const sqlClient = driver as {
            begin: <T>(run: (transaction: TransactionClient) => Promise<T>) => Promise<T>
          }
          for (let i = 0; i < queries.length; i += MAX_BATCH_STATEMENTS) {
            const chunk = queries.slice(i, i + MAX_BATCH_STATEMENTS)
            await sqlClient.begin(transaction => Promise.all(chunk.map(q =>
              transaction.unsafe(toPostgresQuery(q.sql), q.params || []),
            )))
          }
          break
        }
      }
    },
  }
}

export type RawExecutor = ReturnType<typeof getRawExecutor>

/**
 * Get raw SQL executor from event context or create new one
 */
export async function useRawDb(event?: H3Event): Promise<RawExecutor> {
  const client = await useDrizzle(event)
  return getRawExecutor(client)
}

/**
 * Close underlying database driver connection
 */
export async function closeDriver(db: DrizzleDatabase['db']): Promise<void> {
  const cached = driverCache.get(db)
  if (!cached)
    return

  const { type, driver } = cached

  switch (type) {
    case 'better-sqlite3': {
      const sqlite = driver as { close?: () => void }
      sqlite.close?.()
      break
    }
    case 'node-sqlite': {
      const sqlite = driver as { close?: () => void }
      sqlite.close?.()
      break
    }
    case 'libsql': {
      const client = driver as { close?: () => void }
      client.close?.()
      break
    }
    case 'postgres': {
      const sqlClient = driver as { end: () => Promise<void> }
      await sqlClient.end()
      break
    }
    // D1 and Neon are serverless or HTTP drivers with no connection to close.
  }

  driverCache.delete(db)
}
