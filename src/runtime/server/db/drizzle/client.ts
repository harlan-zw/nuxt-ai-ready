import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { H3Event } from '#nuxtseo/h3'
import { DB_CONTEXT_KEY } from '../context'
import { closeDriver } from './raw'

export type DatabaseDialect = 'sqlite' | 'postgres'

type SQLiteDB = BetterSQLite3Database | SQLiteBunDatabase | LibSQLDatabase | DrizzleD1Database | NodeSQLiteDatabase
type PostgresDB = NeonHttpDatabase | PostgresJsDatabase

export interface DrizzleDatabase {
  dialect: DatabaseDialect
  db: SQLiteDB | PostgresDB
}

let fallbackClient: DrizzleDatabase | undefined

/**
 * Get Drizzle database instance
 */
export async function useDrizzle(event?: H3Event): Promise<DrizzleDatabase> {
  if (event?.context?.[DB_CONTEXT_KEY]) {
    return event.context[DB_CONTEXT_KEY] as DrizzleDatabase
  }

  if (!event && fallbackClient) {
    return fallbackClient
  }

  // Import from build-time aliased virtual module (tree-shakeable)
  const { createClient } = await import('#ai-ready-virtual/db-provider.mjs')
  const client = await createClient(event) as DrizzleDatabase

  if (event?.context) {
    event.context[DB_CONTEXT_KEY] = client
  }
  else {
    fallbackClient = client
  }

  return client
}

export async function closeDrizzle(event?: H3Event): Promise<void> {
  if (event?.context?.[DB_CONTEXT_KEY]) {
    const client = event.context[DB_CONTEXT_KEY] as DrizzleDatabase
    await closeDriver(client.db)
    delete event.context[DB_CONTEXT_KEY]
  }
  else if (!event && fallbackClient) {
    await closeDriver(fallbackClient.db)
    fallbackClient = undefined
  }
}
