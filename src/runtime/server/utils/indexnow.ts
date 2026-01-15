import type { H3Event } from 'h3'
import { getSiteConfig } from '#site-config/server/composables'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import {
  countPagesNeedingIndexNowSync,
  getPagesNeedingIndexNowSync,
  markIndexNowSynced,
  updateIndexNowStats,
} from '../db/queries'
import { logger } from '../logger'

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
 * Submit URLs to IndexNow API
 */
export async function submitToIndexNow(
  routes: string[],
  config: { key: string, host?: string },
  siteUrl: string,
): Promise<{ success: boolean, error?: string }> {
  if (!siteUrl) {
    return { success: false, error: 'Site URL not configured' }
  }

  const host = config.host || 'api.indexnow.org'
  const endpoint = `https://${host}/indexnow`

  // Convert routes to absolute URLs
  const urlList = routes.map(route =>
    route.startsWith('http') ? route : `${siteUrl}${route}`,
  )

  const body = {
    host: new URL(siteUrl).host,
    key: config.key,
    keyLocation: `${siteUrl}/${config.key}.txt`,
    urlList,
  }

  logger.debug(`[indexnow] Submitting ${urlList.length} URLs to ${endpoint}`)

  const response = await $fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch((err: Error) => ({ error: err.message }))

  if (response && typeof response === 'object' && 'error' in response) {
    logger.warn(`[indexnow] Submission failed: ${response.error}`)
    return { success: false, error: response.error as string }
  }

  logger.debug(`[indexnow] Successfully submitted ${urlList.length} URLs`)
  return { success: true }
}

/**
 * Submit pending pages to IndexNow
 * Queries DB for pages needing sync, submits, marks as synced
 * Implements exponential backoff on 429 rate limit errors
 */
export async function syncToIndexNow(
  event: H3Event | undefined,
  limit = 100,
): Promise<IndexNowResult> {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as { indexNowKey?: string }
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

  // Get pages needing sync
  const pages = await getPagesNeedingIndexNowSync(event, limit)
  if (pages.length === 0) {
    return { success: true, submitted: 0, remaining: 0 }
  }

  const routes = pages.map(p => p.route)

  // Submit to IndexNow (host always defaults to api.indexnow.org)
  const result = await submitToIndexNow(routes, { key: config.indexNowKey }, siteConfig.url)

  if (result.success) {
    // Clear backoff on success
    await setBackoffInfo(event, null)
    // Mark as synced and update stats
    await markIndexNowSynced(event, routes)
    await updateIndexNowStats(event, routes.length)
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

  const remaining = await countPagesNeedingIndexNowSync(event)

  return {
    success: result.success,
    submitted: result.success ? routes.length : 0,
    remaining,
    error: result.error,
    backoff: !result.success && result.error?.includes('429'),
  }
}
