import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { StaleCheckResult } from './checkStale'
import { useRuntimeConfig } from 'nitropack/runtime'
import { completeCronRun, getCronFastPathStatus, getNextSitemapToCrawl, markSitemapCrawled, markSitemapError, pruneCronRunsByAge, pruneStaleRoutes, startCronRun, syncSitemaps } from '../db/queries'
import { logger } from '../logger'
import { batchIndexPages } from './batchIndex'
import { checkAndHandleStale } from './checkStale'
import { useFetch } from './fetch'
import { syncToIndexNow } from './indexnow'
import { getSitemapsFromConfig } from './sitemap'

const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface CronResult {
  runId?: number | null
  stale?: StaleCheckResult
  sitemap?: {
    name?: string
    pinged: boolean
    error?: string
    pruned: number
  }
  index?: {
    indexed: number
    remaining: number
    errors?: string[]
    complete: boolean
  }
  indexNow?: {
    submitted: number
    remaining: number
    error?: string
  }
}

const PING_TIMEOUT = 30000 // 30s for sitemap ping

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

  if (debug) {
    logger.info(`[cron] Starting cron run (batchSize: ${options?.batchSize ?? config.runtimeSync.batchSize}, indexNow: ${!!config.indexNow})`)
  }

  // Fast path: single query to check if any work is needed
  if (config.runtimeSync.enabled) {
    const status = await getCronFastPathStatus(event)
    if (status) {
      const now = Date.now()
      const staleCheckNeeded = !status.lastStaleCheck || (now - status.lastStaleCheck) >= STALE_CHECK_INTERVAL_MS
      const inBackoff = status.indexNowBackoff && now < status.indexNowBackoff.until
      const hasWork = staleCheckNeeded
        || status.pendingPages > 0
        || status.sitemapsNeedCrawl > 0
        || (config.indexNow && status.indexNowPending > 0 && !inBackoff)

      if (!hasWork) {
        if (debug) {
          const duration = Date.now() - startTime
          logger.info(`[cron] Fast path: no work needed (${duration}ms)`)
        }
        return {
          stale: { action: 'none', dbCount: status.totalPages, reason: 'fast_path_no_work' },
          index: { indexed: 0, remaining: 0, complete: true },
          indexNow: config.indexNow ? { submitted: 0, remaining: status.indexNowPending } : undefined,
        }
      }

      if (debug) {
        logger.info(`[cron] Work needed: stale=${staleCheckNeeded}, pending=${status.pendingPages}, sitemaps=${status.sitemapsNeedCrawl}, indexNow=${status.indexNowPending}`)
      }
    }
  }

  // Check for stale data and handle restore/mark-pending
  // This runs before indexing to ensure data is ready
  if (config.runtimeSync.enabled) {
    results.stale = await checkAndHandleStale(event).catch((err) => {
      console.warn('[ai-ready:cron] Stale check failed:', err.message)
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
    const sitemapResult = await pingSitemap(event, config, debug).catch((err): { name?: string, pinged: boolean, pruned: number, error?: string } => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[ai-ready:cron] Sitemap ping failed:', msg)
      allErrors.push(`sitemap: ${msg}`)
      return { pinged: false, pruned: 0, error: msg }
    })
    results.sitemap = sitemapResult
    if (debug) {
      if (sitemapResult.name) {
        logger.info(`[cron] Sitemap: pinged ${sitemapResult.name}${sitemapResult.error ? ` (error: ${sitemapResult.error})` : ''}`)
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

  // Run IndexNow sync if key is configured
  if (config.indexNow) {
    const indexNowResult = await syncToIndexNow(event, 100).catch((err) => {
      console.warn('[ai-ready:cron] IndexNow sync failed:', err.message)
      return { success: false, submitted: 0, remaining: 0, error: err.message }
    })
    results.indexNow = {
      submitted: indexNowResult.submitted,
      remaining: indexNowResult.remaining,
      error: indexNowResult.error,
    }
    if (indexNowResult.error) {
      allErrors.push(`IndexNow: ${indexNowResult.error}`)
    }
    if (debug) {
      const status = indexNowResult.error
        ? `error: ${indexNowResult.error}`
        : `${indexNowResult.submitted} submitted (${indexNowResult.remaining} remaining)`
      logger.info(`[cron] IndexNow: ${status}`)
    }
  }

  // Complete the cron run log (only if debugCron enabled)
  if (runId && config.debugCron) {
    await completeCronRun(event, runId, {
      pagesIndexed: results.index?.indexed || 0,
      pagesRemaining: results.index?.remaining || 0,
      indexNowSubmitted: results.indexNow?.submitted || 0,
      indexNowRemaining: results.indexNow?.remaining || 0,
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
    if (results.indexNow?.submitted)
      parts.push(`${results.indexNow.submitted} submitted to IndexNow`)
    if (allErrors.length > 0)
      parts.push(`${allErrors.length} errors`)
    logger.info(`[cron] Complete in ${duration}ms${parts.length > 0 ? `: ${parts.join(', ')}` : ''}`)
  }

  return results
}

/**
 * Ping next sitemap to trigger rendering and seeding
 * The sitemap-seeder plugin hooks into sitemap:resolved to seed routes
 */
async function pingSitemap(
  event: H3Event | undefined,
  config: ModulePublicRuntimeConfig,
  debug?: boolean,
): Promise<{ name?: string, pinged: boolean, pruned: number, error?: string }> {
  const { pruneTtl } = config.runtimeSync
  const $fetch = useFetch(event)

  // Sync sitemap list from runtime config to DB
  const sitemaps = getSitemapsFromConfig(event)
  if (sitemaps.length === 0) {
    // Fallback: single sitemap mode
    sitemaps.push({ name: 'sitemap.xml', route: '/sitemap.xml' })
  }

  await syncSitemaps(event, sitemaps)

  // Get next sitemap to ping (round-robin, prioritizes errors for retry)
  const nextSitemap = await getNextSitemapToCrawl(event)
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

  // Ping the sitemap to trigger rendering
  // The sitemap-seeder plugin will hook into sitemap:resolved and seed routes
  let error: string | undefined
  try {
    if (debug)
      logger.info(`[cron] Starting sitemap fetch: ${nextSitemap.route}`)
    await $fetch(nextSitemap.route, {
      responseType: 'text',
      timeout: PING_TIMEOUT,
    })
    if (debug)
      logger.info(`[cron] Sitemap fetch complete`)
    // Success - plugin already seeded routes via hook
    // Just mark as crawled (url count tracked by plugin via markSitemapCrawled)
    // Note: plugin may have already called markSitemapCrawled, but we call again
    // in case the hook didn't fire (e.g., cached response)
    await markSitemapCrawled(event, nextSitemap.name, 0)
  }
  catch (e) {
    error = e instanceof Error ? e.message : String(e)
    await markSitemapError(event, nextSitemap.name, error)
  }

  // Prune stale routes if configured
  let pruned = 0
  if (pruneTtl > 0) {
    pruned = await pruneStaleRoutes(event, pruneTtl)
  }

  return {
    name: nextSitemap.name,
    pinged: !error,
    pruned,
    error,
  }
}
