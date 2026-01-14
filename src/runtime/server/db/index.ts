import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack/types'
import type { DatabaseAdapter } from './shared'
import { createConnector } from '#ai-ready/db-provider'
import { useNitroApp } from 'nitropack/runtime'
import { createAdapter, initSchema } from './shared'

const DB_KEY = '_aiReadyDb'

interface NitroContext {
  [DB_KEY]?: Promise<DatabaseAdapter>
}

/**
 * Get the database adapter instance
 * Cached on nitro context for request lifecycle
 */
export function useDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  const nitro = useNitroApp() as NitroApp & NitroContext
  if (!nitro[DB_KEY]) {
    nitro[DB_KEY] = initDatabase(event)
  }
  return nitro[DB_KEY]
}

async function initDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  const connector = await createConnector(event)

  if (!connector) {
    throw new Error('Failed to initialize database connector')
  }

  const dbAdapter = createAdapter(connector)
  await initSchema(dbAdapter)

  return dbAdapter
}

// Re-export types
export type { DatabaseAdapter } from './shared'
