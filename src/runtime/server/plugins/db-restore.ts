import { defineNitroPlugin } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { hasPages } from '../db/queries'
import { decompressDump, importDump } from '../db/dump'
import { logger } from '../logger'

export default defineNitroPlugin(async () => {
  // Skip during prerender - data is written directly to DB
  if (import.meta.prerender) return

  // Skip in development - no dump available
  if (import.meta.dev) return

  const db = await useDatabase()

  // Check if database already has data
  if (await hasPages(db)) {
    logger.debug('[db-restore] Database already has data, skipping restore')
    return
  }

  // Try to restore from dump
  const dumpData = await globalThis.$fetch('/__ai-ready/pages.dump', {
    responseType: 'text',
  }).catch(() => null) as string | null

  if (!dumpData) {
    logger.debug('[db-restore] No dump found, starting with empty database')
    return
  }

  const rows = await decompressDump(dumpData)
  await importDump(db, rows)
  logger.info(`[db-restore] Restored ${rows.length} pages from dump`)
})
