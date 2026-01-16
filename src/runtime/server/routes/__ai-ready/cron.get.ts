import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { runCron } from '../../utils/runCron'

/**
 * Cron endpoint for platforms that use HTTP-based cron (Vercel, etc.)
 */
export default eventHandler((event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  // Require secret for cron endpoint
  if (config.runtimeSyncSecret) {
    const { secret } = getQuery(event)
    if (secret !== config.runtimeSyncSecret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  return runCron(event)
})
