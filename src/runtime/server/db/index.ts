import type { Connector } from 'db0'
import type { H3Event } from 'h3'
import type { DatabaseAdapter } from './schema'
import { mkdir } from 'node:fs/promises'
// @ts-expect-error - resolved at build time via module alias
import adapter from '#ai-ready/adapter'
import { useRuntimeConfig } from 'nitropack/runtime'
import { dirname } from 'pathe'
import { initSchema } from './schema'

let _db: Connector | null = null
let _initPromise: Promise<DatabaseAdapter> | null = null

/**
 * Get the database adapter instance
 * Initializes the database on first call
 */
export function useDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  if (!_initPromise) {
    _initPromise = initDatabase(event)
  }
  return _initPromise
}

async function initDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
    database: {
      type: 'sqlite' | 'd1' | 'libsql'
      filename?: string
      bindingName?: string
      url?: string
      authToken?: string
    }
  }

  if (config.database.type === 'd1') {
    // D1 requires the binding from event context
    const binding = (event?.context?.cloudflare?.env as Record<string, unknown>)?.[config.database.bindingName || 'AI_READY_DB']
    if (!binding) {
      throw new Error(`D1 binding '${config.database.bindingName || 'AI_READY_DB'}' not found in event context`)
    }
    _db = adapter({ binding })
  }
  else if (config.database.type === 'libsql') {
    _db = adapter({
      url: config.database.url,
      authToken: config.database.authToken,
    })
  }
  else {
    // SQLite - ensure directory exists
    const dbPath = config.database.filename || '.data/ai-ready/pages.db'
    await mkdir(dirname(dbPath), { recursive: true })
    _db = adapter({ path: dbPath })
  }

  if (!_db) {
    throw new Error('Failed to initialize database connector')
  }

  // Create adapter wrapper with async interface
  const dbAdapter = createAdapter(_db)

  // Initialize schema
  await initSchema(dbAdapter)

  return dbAdapter
}

function createAdapter(db: Connector): DatabaseAdapter {
  return {
    all: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const result = await db.prepare(sql).all(...(params as never[]))
      return (result || []) as T[]
    },
    first: async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
      return db.prepare(sql).get(...(params as never[])) as T | undefined
    },
    exec: async (sql: string, params: unknown[] = []): Promise<void> => {
      await db.prepare(sql).run(...(params as never[]))
    },
  }
}

/**
 * Reset database connection (for testing)
 */
export function _resetDatabase(): void {
  _db = null
  _initPromise = null
}

// Re-export types
export type { DatabaseAdapter } from './schema'
