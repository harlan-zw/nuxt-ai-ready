import type { H3Event } from 'h3'
import * as schema from '#ai-ready-virtual/db-schema.mjs'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { url?: string }
  }

  const connectionString = config.database.url || process.env.POSTGRES_URL || process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('[ai-ready] Missing database URL. Set POSTGRES_URL or configure database.url')
  }

  logger.debug(`[drizzle] Connecting to Neon Postgres`)

  const sqlFn = neon(connectionString)
  const db = drizzle(sqlFn, { schema })
  registerDriver(db, 'neon', sqlFn)
  return { dialect: 'postgres' as const, db }
}
