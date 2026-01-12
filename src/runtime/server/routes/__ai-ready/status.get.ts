import type { ModulePublicRuntimeConfig } from '../../../../module'
import { eventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { countPages, countPagesNeedingIndexNowSync, getIndexNowStats } from '../../db/queries'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig & { indexNow?: { enabled?: boolean } }

  const [total, pending] = await Promise.all([
    countPages(event),
    countPages(event, { where: { pending: true } }),
  ])

  const result: Record<string, unknown> = {
    total,
    indexed: total - pending,
    pending,
  }

  // Include IndexNow stats if enabled
  if (config.indexNow?.enabled) {
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
