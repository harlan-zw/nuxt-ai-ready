import type { PageEntry } from '../db/queries'
import { eventHandler, setHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { getSiteConfig } from '#site-config/server/composables'
import { toMarkdownPath } from '../../markdown-path'
import { toDeployedRoute } from '../../route-path'
import { queryPages } from '../db/queries'
import { logger } from '../logger'
import { buildSitemapMd } from '../utils/sitemap-md'

export default eventHandler(async (event) => {
  const fullRuntimeConfig = useRuntimeConfig(event)
  const runtimeConfig = fullRuntimeConfig['nuxt-ai-ready'] as {
    llmsTxtCacheSeconds?: number
  }
  const cacheSeconds = runtimeConfig.llmsTxtCacheSeconds ?? 600
  const cacheEnabled = !import.meta.dev && cacheSeconds > 0

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  if (cacheEnabled) {
    setHeader(event, 'Cache-Control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`)
  }

  let pages: PageEntry[] = []
  try {
    pages = await queryPages(event) as PageEntry[]
  }
  catch (err) {
    logger.warn(
      `[ai-ready] Database unavailable for sitemap.md, serving an empty sitemap: `
      + `${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const baseURL = fullRuntimeConfig.app.baseURL
  return buildSitemapMd(
    pages.map(page => ({ route: page.route, title: page.title, updatedAt: page.updatedAt })),
    {
      siteName: getSiteConfig(event).name,
      resolveHref: route => toDeployedRoute(toMarkdownPath(route), baseURL),
    },
  )
})
