import type { ModulePublicRuntimeConfig } from '../../../../module'
import type { DumpRow } from '../../db/shared'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../../db'
import { decompressFromBase64, importDbDump } from '../../db/shared'
import { logger } from '../../logger'
import { fetchPublicAsset } from '../../utils/fetchPublicAsset'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const query = getQuery(event)

  // Check secret if configured
  if (config.runtimeSyncSecret) {
    const secret = query.secret as string
    if (secret !== config.runtimeSyncSecret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  // Fetch dump file
  logger.debug('[restore] Fetching dump...')
  const dumpData = await fetchPublicAsset<string>(event, '/__ai-ready/pages.dump', { responseType: 'text' })

  if (!dumpData) {
    throw createError({ statusCode: 404, message: 'Dump file not found' })
  }

  logger.debug(`[restore] Fetched dump (${dumpData.length} bytes)`)

  const db = await useDatabase(event)

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
