import type { AiReadyDatabaseEvent } from '../../context'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(_event?: AiReadyDatabaseEvent) {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
    database: { url?: string }
  }

  const connectionString = config.database.url || process.env.POSTGRES_URL || process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('[ai-ready] Missing database URL. Set POSTGRES_URL or configure database.url')
  }

  logger.debug(`[drizzle] Connecting to Neon Postgres`)

  const sqlFn = neon(connectionString)
  const db = drizzle({ client: sqlFn })
  registerDriver(db, 'neon', sqlFn)
  return { dialect: 'postgres' as const, db }
}
