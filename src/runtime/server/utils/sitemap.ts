import type { H3Event } from 'h3'
import { parseSitemapXml } from '@nuxtjs/sitemap/utils'
import { logger } from '../logger'

export interface SitemapUrl {
  loc: string
  lastmod?: string
}

export async function fetchSitemapUrls(event: H3Event): Promise<SitemapUrl[]> {
  const sitemapRes = await event.$fetch('/sitemap.xml', { responseType: 'text' }).catch(() => null)
  if (!sitemapRes) {
    logger.warn('Sitemap not found at /sitemap.xml - llms.txt will have no pages listed')
    return []
  }

  const result = await parseSitemapXml(sitemapRes).catch((e) => {
    logger.warn('Failed to parse sitemap.xml:', e)
    return { urls: [] }
  })
  const urls = result?.urls || []

  if (urls.length === 0) {
    logger.warn('Sitemap is empty - llms.txt will have no pages listed')
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
