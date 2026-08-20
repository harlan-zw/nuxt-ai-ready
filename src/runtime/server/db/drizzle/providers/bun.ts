import type { H3Event } from '#nuxtseo/h3'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'
import { resolveWritableDbPath } from './dbPath'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { filename?: string }
  }

  const dbPath = await resolveWritableDbPath(config.database.filename || '.data/ai-ready/pages.db')
  logger.debug(`[drizzle] Opening Bun SQLite database: ${dbPath}`)

  const sqlite = new Database(dbPath)
  const db = drizzle({ client: sqlite })
  registerDriver(db, 'better-sqlite3', sqlite) // Same API as better-sqlite3
  return { dialect: 'sqlite' as const, db }
}
