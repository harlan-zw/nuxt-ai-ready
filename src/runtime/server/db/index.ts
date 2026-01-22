import type { H3Event } from 'h3'
import type { DatabaseAdapter } from './shared'
import { createConnector } from '#ai-ready/db-provider'
import { createAdapter, initSchema } from './shared'

const DB_CONTEXT_KEY = '_aiReadyDb'

let fallbackAdapter: DatabaseAdapter | undefined

/**
 * Get the database adapter instance
 * Caches per-request via event.context, or per-invocation for scheduled tasks
 */
export async function useDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  // Check event context cache first (for HTTP requests)
  if (event?.context?.[DB_CONTEXT_KEY]) {
    return event.context[DB_CONTEXT_KEY] as DatabaseAdapter
  }

  // Reuse fallback adapter if no event provided (e.g. cron, background tasks)
  // This prevents connection leaks in non-request contexts
  if (!event && fallbackAdapter) {
    return fallbackAdapter
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
  else {
    // Cache as fallback for future non-request calls
    fallbackAdapter = dbAdapter
  }

  return dbAdapter
}

/**
 * Close database connection(s)
 * If event provided, closes request-scoped connection
 * If no event, closes fallback connection
 */
export async function closeDatabase(event?: H3Event): Promise<void> {
  if (event?.context?.[DB_CONTEXT_KEY]) {
    const db = event.context[DB_CONTEXT_KEY] as DatabaseAdapter
    await db.close().catch(() => {})
    delete event.context[DB_CONTEXT_KEY]
  }
  else if (!event && fallbackAdapter) {
    await fallbackAdapter.close().catch(() => {})
    fallbackAdapter = undefined
  }
}

// Re-export types
export type { DatabaseAdapter } from './shared'
