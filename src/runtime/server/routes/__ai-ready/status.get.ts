import type { ModulePublicRuntimeConfig } from '../../../../module'
import { eventHandler } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { countPages, countRecentlyIndexed, getCronLockStatus, getRecentCronRuns, getRecentlyIndexedPages, getSitemapStatus } from '../../db/queries'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig

  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

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

  // Include cron and sitemap info if runtime sync is enabled
  if (config.runtimeSync) {
    const [cronRuns, sitemaps, cronLock] = await Promise.all([
      getRecentCronRuns(event, 3),
      getSitemapStatus(event),
      getCronLockStatus(event),
    ])

    result.cron = {
      lock: {
        held: cronLock.held,
        since: cronLock.since,
        elapsedMs: cronLock.elapsedMs,
        stale: cronLock.stale,
      },
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
        continuing: s.continuing,
      }))
    }
  }

  return result
})
