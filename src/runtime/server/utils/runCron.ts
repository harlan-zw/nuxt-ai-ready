import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { StaleCheckResult } from './checkStale'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { completeCronRun, getCronFastPathStatus, getNextSitemapToCrawl, markSitemapCrawled, markSitemapCrawlPartial, markSitemapError, pruneCronRunsByAge, pruneStaleRoutes, releaseCronLock, seedRoutes, startCronRun, syncSitemaps, tryAcquireCronLock } from '../db/queries'
import { logger } from '../logger'
import { batchIndexPages } from './batchIndex'
import { checkAndHandleStale, STALE_CHECK_INTERVAL_MS } from './checkStale'
import { resolveCronPlan, resolveSitemapIntervalMinutes } from './cron-plan'
import { crawlSitemapByRoute, getSitemapsFromConfig, mapSitemapRoutes } from './sitemap'

interface SitemapPingResult {
  name?: string
  pinged: boolean
  continuing?: boolean
  error?: string
  pruned: number
}

export interface CronResult {
  runId?: number | null
  stale?: StaleCheckResult
  sitemap?: {
    name?: string
    pinged: boolean
    continuing?: boolean
    error?: string
    pruned: number
  }
  index?: {
    indexed: number
    remaining: number
    errors?: string[]
    complete: boolean
  }
}

/**
 * Run cron job logic - shared between scheduled task and HTTP endpoint
 */
export async function runCron(event: H3Event | undefined, options?: { batchSize?: number }): Promise<CronResult> {
  // Skip in dev - DB and context not available
  if (import.meta.dev)
    return {}

  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const debug = config.debug
  const startTime = Date.now()
  const results: CronResult = {}
  const allErrors: string[] = []
  const sitemapIntervalMinutes = resolveSitemapIntervalMinutes(config.runtimeSync.ttl)

  // Prevent overlapping cron runs
  const acquired = await tryAcquireCronLock(event)
  if (!acquired) {
    if (debug) {
      logger.info(`[cron] Skipping - another cron run is in progress`)
    }
    return { stale: { action: 'none' as const, dbCount: 0, reason: 'lock_held' } }
  }

  if (debug) {
    logger.info(`[cron] Starting cron run (batchSize: ${options?.batchSize ?? config.runtimeSync.batchSize})`)
  }

  try {
  // Fast path: single query to check if any work is needed
    if (config.runtimeSync.enabled) {
      const status = await getCronFastPathStatus(event, sitemapIntervalMinutes)
      if (status) {
        const now = Date.now()
        const staleCheckNeeded = !status.lastStaleCheck || (now - status.lastStaleCheck) >= STALE_CHECK_INTERVAL_MS
        const plan = resolveCronPlan({
          status,
          runtimeSyncTtlSeconds: config.runtimeSync.ttl,
          staleCheckNeeded,
        })

        if (!plan.hasWork) {
          if (debug) {
            const duration = Date.now() - startTime
            logger.info(`[cron] Fast path: no work needed (${duration}ms)`)
          }
          return {
            stale: { action: 'none', dbCount: status.totalPages, reason: 'fast_path_no_work' },
            index: { indexed: 0, remaining: 0, complete: true },
          }
        }

        if (debug) {
          logger.info(`[cron] Work needed: stale=${staleCheckNeeded}, pending=${status.pendingPages}, sitemaps=${status.sitemapsNeedCrawl}`)
        }
      }
    }

    // Check for stale data and handle restore/mark-pending
    // This runs before indexing to ensure data is ready
    if (config.runtimeSync.enabled) {
      results.stale = await checkAndHandleStale(event).catch((err) => {
        logger.warn('[ai-ready:cron] Stale check failed:', err.message)
        allErrors.push(`stale-check: ${err.message}`)
        return { action: 'none' as const, dbCount: 0, reason: err.message }
      })
      if (debug && results.stale) {
        logger.info(`[cron] Stale check: ${results.stale.action} (db: ${results.stale.dbCount}, dump: ${results.stale.dumpCount ?? 'n/a'})`)
      }
    }

    // Ping next sitemap to trigger seeding via sitemap:resolved hook
    // The sitemap-seeder plugin handles actual route insertion
    if (config.runtimeSync.enabled) {
      const sitemapResult = await pingSitemap(event, config, sitemapIntervalMinutes, debug).catch((err): SitemapPingResult => {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('[ai-ready:cron] Sitemap ping failed:', msg)
        allErrors.push(`sitemap: ${msg}`)
        return { pinged: false, pruned: 0, error: msg }
      })
      results.sitemap = sitemapResult
      if (debug) {
        if (sitemapResult.name) {
          logger.info(`[cron] Sitemap: pinged ${sitemapResult.name}${sitemapResult.continuing ? ' (continuing)' : sitemapResult.error ? ` (error: ${sitemapResult.error})` : ''}`)
        }
        if (sitemapResult.pruned > 0) {
          logger.info(`[cron] Sitemap: pruned ${sitemapResult.pruned} stale routes`)
        }
      }
    }

    // Start logging this cron run (only if debugCron enabled)
    const runId = config.debugCron ? await startCronRun(event) : null
    results.runId = runId

    // Run runtime indexing if enabled
    if (config.runtimeSync.enabled) {
      const limit = options?.batchSize ?? config.runtimeSync.batchSize
      const indexResult = await batchIndexPages(event, {
        limit,
        all: false,
      })
      results.index = {
        indexed: indexResult.indexed,
        remaining: indexResult.remaining,
        errors: indexResult.errors.length > 0 ? indexResult.errors : undefined,
        complete: indexResult.complete,
      }
      if (indexResult.errors.length > 0) {
        allErrors.push(...indexResult.errors)
      }
      if (debug) {
        logger.info(`[cron] Index: ${indexResult.indexed} pages (${indexResult.remaining} remaining${indexResult.errors.length > 0 ? `, ${indexResult.errors.length} errors` : ''})`)
      }
    }

    // Complete the cron run log (only if debugCron enabled)
    if (runId && config.debugCron) {
      await completeCronRun(event, runId, {
        pagesIndexed: results.index?.indexed || 0,
        pagesRemaining: results.index?.remaining || 0,
        errors: allErrors,
      })

      // Prune cron logs older than 24 hours
      await pruneCronRunsByAge(event)
    }

    // Summary log
    if (debug) {
      const duration = Date.now() - startTime
      const parts = []
      if (results.stale?.action !== 'none')
        parts.push(results.stale?.action)
      if (results.sitemap?.name)
        parts.push(`pinged ${results.sitemap.name}`)
      if (results.index?.indexed)
        parts.push(`${results.index.indexed} indexed`)
      if (allErrors.length > 0)
        parts.push(`${allErrors.length} errors`)
      logger.info(`[cron] Complete in ${duration}ms${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`)
    }

    return results
  }
  finally {
    // Always release lock; a throw between acquire and release would
    // otherwise strand it for CRON_LOCK_TTL_MS, blocking subsequent runs.
    await releaseCronLock(event).catch((err) => {
      logger.warn(`[cron] Failed to release lock: ${err?.message || err}`)
    })
  }
}

/**
 * Ping next sitemap to trigger rendering and seeding
 * The sitemap-seeder plugin hooks into sitemap:resolved to seed routes
 */
async function pingSitemap(
  event: H3Event | undefined,
  config: ModulePublicRuntimeConfig,
  sitemapIntervalMinutes: number,
  debug?: boolean,
): Promise<SitemapPingResult> {
  const { pruneTtl } = config.runtimeSync

  // Sync sitemap list from runtime config to DB
  const sitemaps = getSitemapsFromConfig(event)
  if (sitemaps.length === 0) {
    // Fallback: single sitemap mode
    sitemaps.push({ name: 'sitemap.xml', route: '/sitemap.xml' })
  }

  await syncSitemaps(event, sitemaps)

  // Get next sitemap to ping (round-robin, prioritizes errors for retry)
  const nextSitemap = await getNextSitemapToCrawl(event, sitemapIntervalMinutes)
  if (!nextSitemap) {
    if (debug)
      logger.info('[cron] No sitemaps to ping')
    // Still do pruning even if no sitemap to ping
    let pruned = 0
    if (pruneTtl > 0) {
      pruned = await pruneStaleRoutes(event, pruneTtl)
    }
    return { pinged: false, pruned }
  }

  if (debug)
    logger.info(`[cron] Pinging sitemap: ${nextSitemap.name} (${nextSitemap.route})`)

  // Fetch one bounded round. ASSETS.fetch avoids self-fetch hangs on Cloudflare.
  if (debug)
    logger.info(`[cron] Starting sitemap fetch: ${nextSitemap.route}`)

  const result = await crawlSitemapByRoute(event, {
    route: nextSitemap.route,
    state: nextSitemap.crawlState,
  })
  const routes = [...mapSitemapRoutes(result.urls).keys()]
  if (routes.length > 0)
    await seedRoutes(event, routes)

  if (result._tag === 'failed') {
    await markSitemapError(event, nextSitemap.name, result.error)
    return {
      name: nextSitemap.name,
      pinged: false,
      pruned: 0,
      error: result.error,
    }
  }

  if (result._tag === 'partial') {
    await markSitemapCrawlPartial(event, nextSitemap.name, result.state)
    if (debug)
      logger.info(`[cron] Sitemap round complete (${result.urls.length} URLs, ${result.state.frontier.length} frontier entries)`)
    return {
      name: nextSitemap.name,
      pinged: true,
      continuing: true,
      pruned: 0,
    }
  }

  if (debug)
    logger.info(`[cron] Sitemap fetch complete (${result.urls.length} URLs)`)
  // Success: mark as crawled with the total count across continuation rounds.
  // Note: sitemap-seeder plugin may also call this via hook, but we call
  // again in case the hook didn't fire (e.g., ASSETS.fetch bypasses hooks)
  await markSitemapCrawled(event, nextSitemap.name, result.urlsObserved)

  // Prune stale routes if configured, but only after a clean crawl. A failed or
  // partial crawl (e.g. a child sitemap 404'd) means some routes' last_seen_at
  // wasn't refreshed; pruning on that incomplete evidence could delete live
  // routes whose sitemap simply failed to load this run.
  let pruned = 0
  if (pruneTtl > 0) {
    pruned = await pruneStaleRoutes(event, pruneTtl, result.startedAt)
  }

  return {
    name: nextSitemap.name,
    pinged: true,
    pruned,
  }
}
