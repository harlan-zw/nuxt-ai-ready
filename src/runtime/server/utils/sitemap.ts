import type { H3Event } from 'h3'
import { parseSitemapXml } from '@nuxtjs/sitemap/utils'
import { logger } from '../logger'

export interface SitemapUrl {
  loc: string
  lastmod?: string
}

const FETCH_TIMEOUT = 15000 // 15s for sitemap (must fit within CF worker limit)

export async function fetchSitemapUrls(event: H3Event): Promise<SitemapUrl[]> {
  logger.debug(`[sitemap] Fetching /sitemap.xml (timeout: ${FETCH_TIMEOUT}ms)`)
  const sitemapRes = await event.$fetch('/sitemap.xml', {
    responseType: 'text',
    timeout: FETCH_TIMEOUT,
  }).catch(() => null)
  if (!sitemapRes) {
    logger.warn('Sitemap not found at /sitemap.xml - ensure @nuxtjs/sitemap is installed and configured')
    return []
  }

  logger.debug(`[sitemap] Parsing sitemap XML (${sitemapRes.length} bytes)`)
  const result = await parseSitemapXml(sitemapRes).catch((e) => {
    logger.warn(`Failed to parse sitemap.xml: ${e instanceof Error ? e.message : e}`)
    return { urls: [] }
  })
  const urls = result?.urls || []
  logger.debug(`[sitemap] Found ${urls.length} URLs in sitemap`)

  if (urls.length === 0) {
    logger.warn('Sitemap is empty - add routes to sitemap or configure sitemap.sources in nuxt.config')
  }

  return urls.map((entry) => {
    if (typeof entry === 'string')
      return { loc: entry }
    return {
      loc: entry.loc,
      lastmod: entry.lastmod instanceof Date ? entry.lastmod.toISOString() : entry.lastmod,
    }
  })
}
