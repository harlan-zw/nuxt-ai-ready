import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../../db'
import { batchIndexPages } from '../../utils/batchIndex'
import { indexPageByRoute } from '../../utils/indexPage'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const query = getQuery(event)

  // Check secret if configured
  if (config.runtimeSync.secret) {
    const secret = query.secret as string
    if (secret !== config.runtimeSync.secret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  // Single route reindex
  const route = query.route as string
  if (route) {
    const result = await indexPageByRoute(route, event, { force: true })
    return result.success
      ? { success: true, title: result.data?.title, isUpdate: result.isUpdate }
      : { success: false, error: result.error }
  }

  // Batch index
  const db = await useDatabase(event)
  const result = await batchIndexPages(db, event, config.runtimeSync.batchSize)

  return {
    indexed: result.indexed,
    remaining: result.remaining,
    errors: result.errors.length > 0 ? result.errors : undefined,
    duration: result.duration,
    complete: result.complete,
  }
})
