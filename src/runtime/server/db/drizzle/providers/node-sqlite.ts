import type { H3Event } from '#nuxtseo/h3'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'
import { resolveWritableDbPath } from './dbPath'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { filename?: string }
  }

  const dbPath = await resolveWritableDbPath(config.database.filename || '.data/ai-ready/pages.db')
  logger.debug(`[drizzle] Opening native SQLite database: ${dbPath}`)

  const sqlite = new DatabaseSync(dbPath)
  const db = drizzle({ client: sqlite })
  registerDriver(db, 'node-sqlite', sqlite)
  return { dialect: 'sqlite' as const, db }
}
