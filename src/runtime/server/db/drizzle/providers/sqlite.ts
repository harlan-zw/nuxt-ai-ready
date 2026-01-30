import type { H3Event } from 'h3'
import { mkdir } from 'node:fs/promises'
import * as schema from '#ai-ready-virtual/db-schema.mjs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { dirname } from 'pathe'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { filename?: string }
  }

  const dbPath = config.database.filename || '.data/ai-ready/pages.db'
  logger.debug(`[drizzle] Opening SQLite database: ${dbPath}`)

  await mkdir(dirname(dbPath), { recursive: true }).catch((err) => {
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      throw new Error(
        `[ai-ready] Cannot create database directory (read-only filesystem). `
        + `On Vercel, set database.type: 'neon'. On Cloudflare, use 'd1'. `
        + `Or configure database.url for LibSQL/Turso.`,
      )
    }
    throw err
  })

  const sqlite = new Database(dbPath)
  const db = drizzle(sqlite, { schema })
  registerDriver(db, 'better-sqlite3', sqlite)
  return { dialect: 'sqlite' as const, db }
}
