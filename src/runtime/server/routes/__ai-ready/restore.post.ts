import type { DumpRow } from '../../db/shared'
import { createError, eventHandler } from 'h3'
import { useRawDb } from '../../db'
import { decompressFromBase64, importDbDump } from '../../db/shared'
import { logger } from '../../logger'
import { fetchPublicAsset } from '../../utils/cloudflare'

export default eventHandler(async (event) => {
  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  const query = (await import('h3')).getQuery(event)

  // Fetch dump file
  logger.debug('[restore] Fetching dump...')
  const dumpData = await fetchPublicAsset<string>(event, '/__ai-ready/pages.dump', { responseType: 'text' })

  if (!dumpData) {
    throw createError({ statusCode: 404, message: 'Dump file not found' })
  }

  logger.debug(`[restore] Fetched dump (${dumpData.length} bytes)`)

  const db = await useRawDb(event)

  // Clear existing pages if requested (default: true for full restore)
  const clear = query.clear !== 'false' && query.clear !== '0'
  if (clear) {
    await db.exec('DELETE FROM ai_ready_pages')
  }

  // Decompress and import
  logger.debug(`[restore] Decompressing dump (${dumpData.length} bytes)`)
  const rows = await decompressFromBase64<DumpRow[]>(dumpData)
  logger.debug(`[restore] Importing ${rows.length} rows to database`)
  await importDbDump(db, rows)
  logger.debug(`[restore] Restored ${rows.length} pages`)

  return {
    restored: rows.length,
    cleared: clear,
  }
})
