import type { SitemapUrlInput, SitemapXmlInput } from '@nuxtjs/sitemap/utils'
import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { parseSitemapStream } from '@nuxtjs/sitemap/utils'
import { withLeadingSlash } from 'ufo'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../logger'
import { fetchPublicAsset, hasAssets } from './cloudflare'

export interface SitemapUrl {
  loc: string
  lastmod?: string
}

export interface SitemapConfig {
  name: string
  route: string
}

const FETCH_TIMEOUT = 15000 // 15s for sitemap

/**
 * Get list of sitemaps from @nuxtjs/sitemap runtime config
 * Returns empty array if sitemap module not configured
 */
export function getSitemapsFromConfig(event?: H3Event): SitemapConfig[] {
  const runtimeConfig = useRuntimeConfig(event)
  const sitemapConfig = runtimeConfig.sitemap as {
    sitemaps?: Record<string, { sitemapName?: string, _route?: string }>
    isMultiSitemap?: boolean
  } | undefined

  if (!sitemapConfig?.sitemaps)
    return []

  const sitemaps: SitemapConfig[] = []

  for (const [key, sitemap] of Object.entries(sitemapConfig.sitemaps)) {
    // Skip 'index' entry (sitemap index, not actual sitemap)
    if (key === 'index')
      continue
    // Only include sitemaps with routes
    if (sitemap._route) {
      sitemaps.push({
        name: sitemap.sitemapName || key,
        route: sitemap._route,
      })
    }
  }

  return sitemaps
}

/**
 * Check if site has multiple sitemaps configured
 */
export function hasMultipleSitemaps(event: H3Event): boolean {
  const sitemaps = getSitemapsFromConfig(event)
  return sitemaps.length > 1
}

/**
 * Normalize sitemap URL entries to SitemapUrl[]
 */
function normalizeUrl(entry: SitemapUrlInput): SitemapUrl {
  if (typeof entry === 'string')
    return { loc: entry }
  return {
    loc: entry.loc,
    lastmod: entry.lastmod instanceof Date ? entry.lastmod.toISOString() : entry.lastmod,
  }
}

function isSitemapXmlInput(value: unknown): value is SitemapXmlInput {
  return typeof value === 'string'
    || value instanceof Uint8Array
    || (typeof value === 'object' && value !== null && 'getReader' in value)
}

/**
 * Fetch and parse a single sitemap by route
 * Supports both request context (event.$fetch) and cron context (ASSETS.fetch or globalThis.$fetch)
 */
export async function fetchSitemapByRoute(
  event: H3Event | undefined,
  route: string,
  depth = 0,
): Promise<{ urls: SitemapUrl[], error?: string }> {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const fetchRoute = withLeadingSlash(route)

  // Use ASSETS.fetch for prerendered sitemaps on Cloudflare (avoids self-fetch issues)
  const usePublicAsset = config.sitemapPrerendered && hasAssets(event)
  logger.debug(`[sitemap] Fetching ${fetchRoute} via ${usePublicAsset ? 'ASSETS.fetch' : event ? 'event.$fetch' : 'globalThis.$fetch'}`)

  let sitemapInput: SitemapXmlInput | null = null

  if (usePublicAsset) {
    sitemapInput = await fetchPublicAsset<SitemapXmlInput>(event, fetchRoute, { responseType: 'stream' })
    if (!sitemapInput) {
      logger.warn(`[sitemap] Not found in ASSETS: ${fetchRoute}`)
      return { urls: [], error: 'Not found in ASSETS' }
    }
  }
  else {
    try {
      // Use event.$fetch when available, fallback to globalThis.$fetch for cron
      const $fetch = event?.$fetch ?? globalThis.$fetch
      const res: unknown = await $fetch(fetchRoute, {
        responseType: 'stream',
        timeout: FETCH_TIMEOUT,
      })
      if (!res) {
        logger.warn(`[sitemap] Empty response from ${fetchRoute}`)
        return { urls: [], error: 'Empty response' }
      }
      if (!isSitemapXmlInput(res)) {
        logger.warn(`[sitemap] Invalid response body from ${fetchRoute}`)
        return { urls: [], error: 'Invalid response body' }
      }
      sitemapInput = res
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`[sitemap] Failed to fetch ${fetchRoute}: ${msg}`)
      return { urls: [], error: msg }
    }
  }

  logger.debug(`[sitemap] Parsing sitemap XML stream`)

  const urls: SitemapUrl[] = []
  const indexEntries: Array<{ loc: string }> = []
  let kind: 'urlset' | 'index' | undefined
  try {
    for await (const parsed of parseSitemapStream(sitemapInput)) {
      if (parsed._tag === 'kind')
        kind = parsed.kind
      else if (parsed._tag === 'url')
        urls.push(normalizeUrl(parsed.url))
      else if (parsed._tag === 'sitemap')
        indexEntries.push(parsed.sitemap)
      else
        logger.warn(`[sitemap] ${fetchRoute}: ${parsed.warning.message}`)
    }
  }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn(`[sitemap] Failed to parse ${fetchRoute}: ${msg}`)
    return { urls: [], error: msg }
  }

  // Sitemap index (i18n / multi-sitemap sites): follow child sitemaps so
  // llms.txt and runtime indexing receive page URLs rather than index entries.
  if (kind === 'index') {
    if (depth >= 3) {
      logger.warn(`[sitemap] Sitemap index nesting too deep at ${fetchRoute}, stopping`)
      return { urls: [] }
    }
    logger.debug(`[sitemap] ${fetchRoute} is a sitemap index with ${indexEntries.length} children`)
    const allUrls: SitemapUrl[] = []
    const childErrors: string[] = []
    for (const entry of indexEntries) {
      const childRoute = entry.loc.startsWith('http') ? new URL(entry.loc).pathname : entry.loc
      // Avoid re-fetching the index itself (self-referencing or normalised duplicate)
      if (withLeadingSlash(childRoute) === fetchRoute)
        continue
      // Keep any URLs we did get, but record child failures so the caller does
      // not treat a partial/empty crawl as a clean, complete one (which would
      // let stale-route pruning act on incomplete evidence).
      const { urls, error } = await fetchSitemapByRoute(event, childRoute, depth + 1)
      allUrls.push(...urls)
      if (error)
        childErrors.push(`${withLeadingSlash(childRoute)}: ${error}`)
    }
    if (childErrors.length > 0) {
      const msg = `${childErrors.length}/${indexEntries.length} child sitemaps failed (${childErrors.join('; ')})`
      logger.warn(`[sitemap] Sitemap index ${fetchRoute}: ${msg}`)
      return { urls: allUrls, error: msg }
    }
    return { urls: allUrls }
  }

  logger.debug(`[sitemap] Found ${urls.length} URLs in ${fetchRoute}`)

  return { urls }
}

/**
 * Fetch all URLs from all sitemaps (or single sitemap if not multi-sitemap)
 * Used for backwards compatibility and llms.txt generation
 */
export async function fetchSitemapUrls(event: H3Event): Promise<SitemapUrl[]> {
  const sitemaps = getSitemapsFromConfig(event)

  // Multi-sitemap: fetch from each configured sitemap
  if (sitemaps.length > 0) {
    logger.debug(`[sitemap] Multi-sitemap mode: ${sitemaps.length} sitemaps`)
    const allUrls: SitemapUrl[] = []

    for (const sitemap of sitemaps) {
      // Include whatever URLs we got even on a partial failure: for llms.txt a
      // partial page list beats none. The error is already logged downstream and
      // matters to the cron crawl-status path, not to URL aggregation here.
      const { urls } = await fetchSitemapByRoute(event, sitemap.route)
      allUrls.push(...urls)
    }

    return allUrls
  }

  // Single sitemap fallback: fetch /sitemap.xml
  logger.debug(`[sitemap] Single sitemap mode: /sitemap.xml`)
  const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

  if (error) {
    logger.warn('Sitemap not found at /sitemap.xml - ensure @nuxtjs/sitemap is installed and configured')
  }
  else if (urls.length === 0) {
    logger.warn('Sitemap is empty - add routes to sitemap or configure sitemap.sources in nuxt.config')
  }

  return urls
}
