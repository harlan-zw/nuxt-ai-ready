import type { ModulePublicRuntimeConfig } from '../../../../module'
import { createError, eventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { countPages, countPagesNeedingIndexNowSync, countRecentlyIndexed, getIndexNowStats, getRecentCronRuns, getRecentlyIndexedPages, getSitemapStatus } from '../../db/queries'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  // Require secret for status endpoint
  if (config.runtimeSyncSecret) {
    const { secret } = getQuery(event)
    if (secret !== config.runtimeSyncSecret) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const [total, pending, recentlyIndexed24h, recentlyIndexed1h, recentPages] = await Promise.all([
    countPages(event),
    countPages(event, { where: { pending: true } }),
    countRecentlyIndexed(event, 24 * 60 * 60 * 1000), // last 24h
    countRecentlyIndexed(event, 60 * 60 * 1000), // last 1h
    getRecentlyIndexedPages(event, 5),
  ])

  const result: Record<string, unknown> = {
    total,
    indexed: total - pending,
    pending,
    activity: {
      last1h: recentlyIndexed1h,
      last24h: recentlyIndexed24h,
      recentPages,
    },
  }

  // Include IndexNow stats if key is configured
  if (config.indexNow) {
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

  // Include cron and sitemap info if runtime sync is enabled
  if (config.runtimeSync) {
    const [cronRuns, sitemaps] = await Promise.all([
      getRecentCronRuns(event, 3),
      getSitemapStatus(event),
    ])

    result.cron = {
      recentRuns: cronRuns.map(r => ({
        startedAt: r.startedAt,
        durationMs: r.durationMs,
        pagesIndexed: r.pagesIndexed,
        status: r.status,
      })),
    }

    if (sitemaps.length) {
      result.sitemaps = sitemaps.map(s => ({
        name: s.name,
        urlCount: s.urlCount,
        lastCrawledAt: s.lastCrawledAt,
        errorCount: s.errorCount,
      }))
    }
  }

  return result
})
