import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { syncToIndexNow } from '../../utils/indexnow'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  if (!config.indexNow) {
    throw createError({ statusCode: 400, message: 'IndexNow not configured' })
  }

  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  const query = getQuery(event)
  const limit = query.limit ? Math.max(1, Math.trunc(Number(query.limit)) || 100) : 100

  return syncToIndexNow(event, limit, { useWaitUntil: true })
})
