import type { H3Event } from 'h3'
import type { DatabaseAdapter } from './shared'
import { createConnector } from '#ai-ready/db-provider'
import { createAdapter, initSchema } from './shared'

const DB_CONTEXT_KEY = '_aiReadyDb'

/**
 * Get the database adapter instance
 * Caches per-request via event.context, or per-invocation for scheduled tasks
 */
export async function useDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  // Check event context cache first (for HTTP requests)
  if (event?.context?.[DB_CONTEXT_KEY]) {
    return event.context[DB_CONTEXT_KEY] as DatabaseAdapter
  }

  const connector = await createConnector(event)

  if (!connector) {
    throw new Error('Failed to initialize database connector')
  }

  const dbAdapter = createAdapter(connector)
  await initSchema(dbAdapter)

  // Cache in event context for subsequent calls in same request
  if (event?.context) {
    event.context[DB_CONTEXT_KEY] = dbAdapter
  }

  return dbAdapter
}

// Re-export types
export type { DatabaseAdapter } from './shared'
