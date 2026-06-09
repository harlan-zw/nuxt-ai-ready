import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { useRuntimeConfig } from 'nitropack/runtime'
import * as schema from '#ai-ready-virtual/db-schema.mjs'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'
import { resolveWritableDbPath } from './dbPath'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { filename?: string }
  }

  const dbPath = await resolveWritableDbPath(config.database.filename || '.data/ai-ready/pages.db')
  logger.debug(`[drizzle] Opening SQLite database: ${dbPath}`)

  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite, { schema })
  registerDriver(db, 'better-sqlite3', sqlite)
  return { dialect: 'sqlite' as const, db }
}
