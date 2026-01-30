import type * as schema from '#ai-ready-virtual/db-schema.mjs'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { H3Event } from 'h3'

export type DatabaseDialect = 'sqlite' | 'postgres'

type SQLiteDB = BetterSQLite3Database<typeof schema> | BunSQLiteDatabase<typeof schema> | LibSQLDatabase<typeof schema> | DrizzleD1Database<typeof schema>
type PostgresDB = NeonHttpDatabase<typeof schema>

export interface DrizzleDatabase {
  dialect: DatabaseDialect
  db: SQLiteDB | PostgresDB
}

const DB_CONTEXT_KEY = '_aiReadyDrizzle'
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
    delete event.context[DB_CONTEXT_KEY]
  }
  else if (!event && fallbackClient) {
    fallbackClient = undefined
  }
}
