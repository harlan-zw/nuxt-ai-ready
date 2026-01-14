import type { H3Event } from 'h3'
import type { DatabaseAdapter } from './shared'
import { createConnector } from '#ai-ready/db-provider'
import { createAdapter, initSchema } from './shared'

/**
 * Get the database adapter instance (lazy init per-request)
 * No global caching to avoid async operations at global scope
 */
export async function useDatabase(event?: H3Event): Promise<DatabaseAdapter> {
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
