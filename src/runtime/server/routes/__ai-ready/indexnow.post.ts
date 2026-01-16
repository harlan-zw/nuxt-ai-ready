import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { syncToIndexNow } from '../../utils/indexnow'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  if (!config.indexNow) {
    throw createError({ statusCode: 400, message: 'IndexNow not configured' })
  }

  const query = getQuery(event)

  // Check secret if configured
  if (config.runtimeSyncSecret) {
    const secret = query.secret as string
    if (secret !== config.runtimeSyncSecret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const limit = query.limit ? Number(query.limit) : 100

  return syncToIndexNow(event, limit, { useWaitUntil: true })
})
