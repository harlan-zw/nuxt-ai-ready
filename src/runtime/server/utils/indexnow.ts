import type { H3Event } from 'h3'
import { getSiteConfig } from '#site-config/server/composables'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import {
  batchIndexNowUpdate,
  countPagesNeedingIndexNowSync,
  getPagesNeedingIndexNowSync,
  logIndexNowSubmission,
  updateIndexNowStats,
} from '../db/queries'
import { logger } from '../logger'
import { submitToIndexNowShared } from './indexnow-shared'

// Re-export shared types
export type { BuildMeta, IndexNowSubmitResult, PageHashMeta } from './indexnow-shared'

// Backoff: 5min, 10min, 20min, 40min, 1hr max
const BACKOFF_MINUTES = [5, 10, 20, 40, 60]

export interface IndexNowResult {
  success: boolean
  submitted: number
  remaining: number
  error?: string
  backoff?: boolean
}

interface BackoffInfo {
  until: number
  attempt: number
}

async function getBackoffInfo(event: H3Event | undefined): Promise<BackoffInfo | null> {
  const db = await useDatabase(event).catch(() => null)
  if (!db)
    return null

  const row = await db.first<{ value: string }>('SELECT value FROM _ai_ready_info WHERE id = ?', ['indexnow_backoff'])
  if (!row)
    return null

  const parsed = JSON.parse(row.value) as BackoffInfo
  return parsed
}

async function setBackoffInfo(event: H3Event | undefined, info: BackoffInfo | null): Promise<void> {
  const db = await useDatabase(event).catch(() => null)
  if (!db)
    return

  if (info) {
    await db.exec('INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)', ['indexnow_backoff', JSON.stringify(info)])
  }
  else {
    await db.exec('DELETE FROM _ai_ready_info WHERE id = ?', ['indexnow_backoff'])
  }
}

/**
 * Submit URLs to IndexNow API with fallback on rate limit
 * Wrapper around shared implementation with runtime-specific fetch
 */
export async function submitToIndexNow(
  routes: string[],
  config: { key: string },
  siteUrl: string,
): Promise<{ success: boolean, error?: string, host?: string }> {
  // Use $fetch wrapper that handles response properly
  const runtimeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString()
    const body = init?.body ? JSON.parse(init.body as string) : undefined

    const result = await $fetch.raw(url, {
      method: init?.method as 'POST',
      headers: init?.headers as Record<string, string>,
      body,
    }).catch((err: Error) => ({ _error: err.message }))

    if (result && '_error' in result) {
      return { ok: false, status: 500, statusText: result._error } as Response
    }

    return { ok: result.status >= 200 && result.status < 300, status: result.status } as Response
  }

  return submitToIndexNowShared(routes, config.key, siteUrl, {
    fetchFn: runtimeFetch,
    logger,
  })
}

export interface SyncToIndexNowOptions {
  /** Use waitUntil for background DB updates (default: false in cron, true otherwise) */
  useWaitUntil?: boolean
}

/**
 * Submit pending pages to IndexNow
 * Queries DB for pages needing sync, submits, marks as synced
 * Implements exponential backoff on 429 rate limit errors
 */
export async function syncToIndexNow(
  event: H3Event | undefined,
  limit = 100,
  options?: SyncToIndexNowOptions,
): Promise<IndexNowResult> {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as { indexNowKey?: string, debug?: boolean }
  const siteConfig = getSiteConfig(event as H3Event)

  if (!config.indexNowKey) {
    return { success: false, submitted: 0, remaining: 0, error: 'IndexNow not configured' }
  }

  if (!siteConfig.url) {
    return { success: false, submitted: 0, remaining: 0, error: 'Site URL not configured' }
  }

  // Check if we're in backoff period
  const backoff = await getBackoffInfo(event)
  if (backoff && Date.now() < backoff.until) {
    const waitMinutes = Math.ceil((backoff.until - Date.now()) / 60000)
    logger.debug(`[indexnow] In backoff period, ${waitMinutes}m remaining`)
    const remaining = await countPagesNeedingIndexNowSync(event)
    return {
      success: false,
      submitted: 0,
      remaining,
      error: `Rate limited, retry in ${waitMinutes}m`,
      backoff: true,
    }
  }

  // Get total pending count and pages needing sync
  const [totalPending, pages] = await Promise.all([
    countPagesNeedingIndexNowSync(event),
    getPagesNeedingIndexNowSync(event, limit),
  ])
  if (pages.length === 0) {
    return { success: true, submitted: 0, remaining: 0 }
  }

  const routes = pages.map(p => p.route)

  // Submit to IndexNow (host always defaults to api.indexnow.org)
  const result = await submitToIndexNow(routes, { key: config.indexNowKey }, siteConfig.url)

  // Defer DB updates via waitUntil so response returns immediately
  const dbUpdates = async () => {
    // Log submission when debug is enabled
    if (config.debug) {
      await logIndexNowSubmission(event, routes.length, result.success, result.error)
    }

    if (result.success) {
      // Clear backoff on success
      await setBackoffInfo(event, null)
      // Batched: mark pages synced + update stats in parallel
      await batchIndexNowUpdate(event, routes, routes.length)
      logger.debug(`[indexnow] DB updated: ${routes.length} pages marked synced via ${result.host}`)
    }
    else {
      await updateIndexNowStats(event, 0, result.error)

      // Set exponential backoff on 429
      if (result.error?.includes('429')) {
        const attempt = backoff ? Math.min(backoff.attempt + 1, BACKOFF_MINUTES.length - 1) : 0
        const backoffMinutes = BACKOFF_MINUTES[attempt] ?? 60
        const until = Date.now() + (backoffMinutes * 60 * 1000)
        await setBackoffInfo(event, { until, attempt })
        logger.warn(`[indexnow] Rate limited, backing off for ${backoffMinutes}m (attempt ${attempt + 1})`)
      }
    }
  }

  // Only use waitUntil if explicitly requested (avoids race conditions in cron)
  if (options?.useWaitUntil && event?.waitUntil) {
    event.waitUntil(dbUpdates().catch(err =>
      logger.error(`[indexnow] Background DB update failed: ${err.message}`),
    ))
  }
  else {
    await dbUpdates()
  }

  // Return optimistic result - DB updates happen in background
  const submitted = result.success ? routes.length : 0
  return {
    success: result.success,
    submitted,
    remaining: Math.max(0, totalPending - submitted),
    error: result.error,
    backoff: !result.success && result.error?.includes('429'),
  }
}
