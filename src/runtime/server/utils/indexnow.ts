import type { H3Event } from 'h3'
import { getSiteConfig } from '#site-config/server/composables'
import { useRuntimeConfig } from 'nitropack/runtime'
import {
  countPagesNeedingIndexNowSync,
  getPagesNeedingIndexNowSync,
  markIndexNowSynced,
  updateIndexNowStats,
} from '../db/queries'
import { logger } from '../logger'

export interface IndexNowResult {
  success: boolean
  submitted: number
  remaining: number
  error?: string
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
 */
export async function syncToIndexNow(
  event: H3Event,
  limit = 100,
): Promise<IndexNowResult> {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as { indexNowKey?: string }
  const siteConfig = getSiteConfig(event)

  if (!config.indexNowKey) {
    return { success: false, submitted: 0, remaining: 0, error: 'IndexNow not configured' }
  }

  if (!siteConfig.url) {
    return { success: false, submitted: 0, remaining: 0, error: 'Site URL not configured' }
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
    // Mark as synced and update stats
    await markIndexNowSynced(event, routes)
    await updateIndexNowStats(event, routes.length)
  }
  else {
    await updateIndexNowStats(event, 0, result.error)
  }

  const remaining = await countPagesNeedingIndexNowSync(event)

  return {
    success: result.success,
    submitted: result.success ? routes.length : 0,
    remaining,
    error: result.error,
  }
}
