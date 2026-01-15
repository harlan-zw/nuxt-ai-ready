import type { ModulePublicRuntimeConfig } from '../../../../module'
import type { DumpRow } from '../../db/shared'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../../db'
import { decompressFromBase64, importDbDump } from '../../db/shared'

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
  let dumpData: string | null = null

  // Try Cloudflare ASSETS binding first
  const cfEnv = event.context?.cloudflare?.env as { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } } | undefined
  if (cfEnv?.ASSETS?.fetch) {
    const response = await cfEnv.ASSETS.fetch(new Request('https://assets.local/__ai-ready/pages.dump'))
    if (response.ok) {
      dumpData = await response.text()
    }
  }

  // Fallback to HTTP fetch
  if (!dumpData) {
    dumpData = await globalThis.$fetch('/__ai-ready/pages.dump', {
      responseType: 'text',
    }).catch(() => null) as string | null
  }

  if (!dumpData) {
    throw createError({ statusCode: 404, message: 'Dump file not found' })
  }

  const db = await useDatabase(event)

  // Clear existing pages if requested (default: true for full restore)
  const clear = query.clear !== 'false' && query.clear !== '0'
  if (clear) {
    await db.exec('DELETE FROM ai_ready_pages')
  }

  // Decompress and import
  const rows = await decompressFromBase64<DumpRow[]>(dumpData)
  await importDbDump(db, rows)

  return {
    restored: rows.length,
    cleared: clear,
  }
})
