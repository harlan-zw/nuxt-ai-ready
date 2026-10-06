import type { AiReadyDatabaseEvent } from '../../context'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'
import { resolveWritableDbPath } from './dbPath'

export async function createClient(_event?: AiReadyDatabaseEvent) {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
    database: { filename?: string }
  }

  const dbPath = await resolveWritableDbPath(config.database.filename || '.data/ai-ready/pages.db')
  logger.debug(`[drizzle] Opening native SQLite database: ${dbPath}`)

  const sqlite = new DatabaseSync(dbPath)
  const db = drizzle({ client: sqlite })
  registerDriver(db, 'node-sqlite', sqlite)
  return { dialect: 'sqlite' as const, db }
}
