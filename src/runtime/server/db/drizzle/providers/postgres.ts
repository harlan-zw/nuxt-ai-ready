import type { H3Event } from '#nuxtseo/h3'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { url?: string }
  }

  const connectionString = config.database.url || process.env.POSTGRES_URL || process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('[ai-ready] Missing database URL. Set DATABASE_URL or configure database.url')
  }

  logger.debug('[drizzle] Connecting to PostgreSQL')

  const sqlClient = postgres(connectionString, { prepare: false })
  const db = drizzle({ client: sqlClient })
  registerDriver(db, 'postgres', sqlClient)
  return { dialect: 'postgres' as const, db }
}
