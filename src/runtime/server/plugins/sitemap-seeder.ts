import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack/types'
import { getPageLastmods, markSitemapCrawled, seedRoutes } from '../db/queries'
import { logger } from '../logger'

interface ResolvedSitemapUrl {
  loc: string
  lastmod?: string | Date
  _path?: { pathname: string } | null
}

interface SitemapResolvedCtx {
  urls: ResolvedSitemapUrl[]
  sitemapName: string
  event: H3Event
}

export default function sitemapSeederPlugin(nitroApp: NitroApp) {
  // Hook into @nuxtjs/sitemap's resolved hook
  // This fires when a sitemap is rendered, giving us the URLs directly
  nitroApp.hooks.hook('sitemap:resolved', async (ctx: SitemapResolvedCtx) => {
    // Skip in dev - DB not available
    if (import.meta.dev)
      return

    const { urls, sitemapName, event } = ctx
    if (urls.length === 0)
      return

    logger.debug(`[sitemap-seeder] Processing ${urls.length} routes from ${sitemapName}`)

    // Extract routes from URLs
    const routes: string[] = []
    const routeToUrl = new Map<string, ResolvedSitemapUrl>()

    for (const u of urls) {
      let route: string
      // Prefer pre-parsed path if available
      if (u._path?.pathname) {
        route = u._path.pathname
      }
      else {
        // Parse from loc
        const loc = u.loc
        route = loc.startsWith('/') ? (loc.split('?')[0] ?? loc) : new URL(loc).pathname
      }
      // Skip file extensions
      if (!route.includes('.')) {
        routes.push(route)
        routeToUrl.set(route, u)
      }
    }

    // Enrich sitemap entries with lastmod from our indexed pages
    const lastmods = await getPageLastmods(event).catch((e) => {
      logger.warn(`[sitemap-seeder] Failed to get lastmods: ${e.message}`)
      return new Map<string, string>()
    })

    let enriched = 0
    for (const [route, url] of routeToUrl) {
      const lastmod = lastmods.get(route)
      if (lastmod && !url.lastmod) {
        url.lastmod = lastmod
        enriched++
      }
    }

    if (enriched > 0) {
      logger.debug(`[sitemap-seeder] Enriched ${enriched} URLs with lastmod`)
    }

    // Seed routes into database
    const seeded = await seedRoutes(event, routes).catch((e) => {
      logger.warn(`[sitemap-seeder] Failed to seed routes: ${e.message}`)
      return 0
    })

    // Mark sitemap as crawled
    await markSitemapCrawled(event, sitemapName, urls.length).catch((e) => {
      logger.warn(`[sitemap-seeder] Failed to mark sitemap: ${e.message}`)
    })

    if (seeded > 0) {
      logger.debug(`[sitemap-seeder] Seeded ${seeded} new routes from ${sitemapName}`)
    }
  })
}
