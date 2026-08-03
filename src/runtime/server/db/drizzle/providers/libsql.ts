import type { H3Event } from '#nuxtseo/h3'
import { createClient as createLibSQLClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '#ai-ready-virtual/db-schema.mjs'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'
import { resolveWritableDbPath } from './dbPath'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { url?: string, authToken?: string, filename?: string }
  }

  let dbUrl = config.database.url || `file:${config.database.filename || '.data/ai-ready/pages.db'}`

  // A local file database (`file:<path>`) can land on a read-only deploy
  // filesystem, where libsql would throw `ConnectionFailed(... : 14)` (CANTOPEN)
  // with no recovery (nuxt/scripts#818). Mirror the sqlite provider: resolve to a
  // writable path, falling back to a temp dir on a read-only dir. Remote libsql /
  // turso URLs (libsql:, http:, https:, ws:, wss:) and URL-authority `file://`
  // forms are left untouched.
  if (dbUrl.startsWith('file:') && !dbUrl.startsWith('file://')) {
    const resolved = await resolveWritableDbPath(dbUrl.slice('file:'.length))
    dbUrl = `file:${resolved}`
  }

  logger.debug(`[drizzle] Connecting to LibSQL: ${dbUrl}`)

  const client = createLibSQLClient({ url: dbUrl, authToken: config.database.authToken })
  const db = drizzle(client, { schema })
  registerDriver(db, 'libsql', client)
  return { dialect: 'sqlite' as const, db }
}
