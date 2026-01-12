import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { batchIndexPages } from '../../utils/batchIndex'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const query = getQuery(event)

  // Check secret if configured
  if (config.runtimeSyncSecret) {
    const secret = query.secret as string
    if (secret !== config.runtimeSyncSecret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const result = await batchIndexPages(event, {
    limit: query.limit ? Number(query.limit) : undefined,
    all: query.all === 'true' || query.all === '1',
    timeout: query.timeout ? Number(query.timeout) : undefined,
  })

  return {
    indexed: result.indexed,
    remaining: result.remaining,
    errors: result.errors.length > 0 ? result.errors : undefined,
    duration: result.duration,
    complete: result.complete,
  }
})
