import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { countPages, countPagesNeedingIndexNowSync, getIndexNowStats } from '../../db/queries'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  // Require secret for status endpoint
  if (config.runtimeSyncSecret) {
    const { secret } = getQuery(event)
    if (secret !== config.runtimeSyncSecret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const [total, pending] = await Promise.all([
    countPages(event),
    countPages(event, { where: { pending: true } }),
  ])

  const result: Record<string, unknown> = {
    total,
    indexed: total - pending,
    pending,
  }

  // Include IndexNow stats if key is configured
  if (config.indexNowKey) {
    const [indexNowPending, indexNowStats] = await Promise.all([
      countPagesNeedingIndexNowSync(event),
      getIndexNowStats(event),
    ])

    result.indexNow = {
      pending: indexNowPending,
      totalSubmitted: indexNowStats.totalSubmitted,
      lastSubmittedAt: indexNowStats.lastSubmittedAt,
      lastError: indexNowStats.lastError,
    }
  }

  return result
})
