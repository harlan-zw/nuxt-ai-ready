import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { syncToIndexNow } from '../../utils/indexnow'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig & { indexNow?: { enabled?: boolean, key?: string } }

  if (!config.indexNow?.enabled) {
    throw createError({ statusCode: 400, message: 'IndexNow not enabled' })
  }

  const query = getQuery(event)

  // Check poll secret if configured (reuses runtimeSync secret)
  if (config.runtimeSync?.secret) {
    const secret = query.secret as string
    if (secret !== config.runtimeSync.secret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const limit = query.limit ? Number(query.limit) : 100

  return syncToIndexNow(event, limit)
})
