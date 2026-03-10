/**
 * Raw SQL execution utilities for Drizzle
 * Provides direct driver access for raw SQL queries
 */
import type { H3Event } from 'h3'
import type { DrizzleDatabase } from './client'
import { useDrizzle } from './client'

// Store underlying driver references alongside Drizzle instance
const driverCache = new WeakMap<DrizzleDatabase['db'], {
  type: 'better-sqlite3' | 'libsql' | 'neon' | 'd1'
  driver: unknown
}>()

/**
 * Register the underlying driver for raw SQL access
 */
export function registerDriver(
  db: DrizzleDatabase['db'],
  type: 'better-sqlite3' | 'libsql' | 'neon' | 'd1',
  driver: unknown,
): void {
  driverCache.set(db, { type, driver })
}

const RE_PARAM_PLACEHOLDER = /\?/g

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
          // Convert ? to $1, $2, etc
          let idx = 0
          const pgQuery = query.replace(RE_PARAM_PLACEHOLDER, () => `$${++idx}`)
          const result = await sqlFn.query(pgQuery, params)
          return ((result as any).rows || result) as T[]
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
          let idx = 0
          const pgQuery = query.replace(RE_PARAM_PLACEHOLDER, () => `$${++idx}`)
          await sqlFn.query(pgQuery, params)
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
export function closeDriver(db: DrizzleDatabase['db']): void {
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
    case 'libsql': {
      const client = driver as { close?: () => void }
      client.close?.()
      break
    }
    // d1 and neon are serverless/HTTP - no connection to close
  }

  driverCache.delete(db)
}
