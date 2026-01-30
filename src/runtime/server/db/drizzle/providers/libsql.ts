import type { H3Event } from 'h3'
import * as schema from '#ai-ready-virtual/db-schema.mjs'
import { createClient as createLibSQLClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { url?: string, authToken?: string, filename?: string }
  }

  const dbUrl = config.database.url || `file:${config.database.filename || '.data/ai-ready/pages.db'}`
  logger.debug(`[drizzle] Connecting to LibSQL: ${dbUrl}`)

  const client = createLibSQLClient({ url: dbUrl, authToken: config.database.authToken })
  const db = drizzle(client, { schema })
  registerDriver(db, 'libsql', client)
  return { dialect: 'sqlite' as const, db }
}
