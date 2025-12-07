// @ts-expect-error virtual
import routes from '#ai-ready/routes.mjs'
import { useRuntimeConfig } from 'nitropack/runtime'

export { jsonResult } from '../utils'

interface RouteRecord {
  path: string
  name?: string
  meta?: Record<string, unknown>
}

export async function getDevPages() {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as { hasSitemap?: boolean }
  if (!config.hasSitemap)
    return (routes as RouteRecord[]).map(r => ({ route: r.path, name: r.name, meta: r.meta }))

  const { parseSitemapXml } = await import('@nuxtjs/sitemap/utils')
  const sitemapRes = await fetch('/sitemap.xml')
  if (!sitemapRes.ok)
    return (routes as RouteRecord[]).map(r => ({ route: r.path, name: r.name, meta: r.meta }))

  const xml = await sitemapRes.text()
  const { urls } = await parseSitemapXml(xml)
  return urls.map((entry) => {
    if (typeof entry === 'string')
      return { route: new URL(entry).pathname }
    return {
      route: new URL(entry.loc).pathname,
      lastmod: entry.lastmod,
    }
  })
}
