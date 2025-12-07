// @ts-expect-error virtual
import routes from '#ai-ready/routes.mjs'
import { useRuntimeConfig } from 'nitropack/runtime'

export { jsonResult } from '../utils'

interface RouteRecord {
  path: string
  name?: string
  meta?: Record<string, unknown>
}

function routeToRegex(routePath: string): RegExp {
  const pattern = routePath
    .replace(/:[^/]+\(\.\*\)\*?/g, '.*') // :param(.*)* or :param(.*)
    .replace(/:[^/]+/g, '[^/]+') // :param
  return new RegExp(`^${pattern}$`)
}

function matchRoute(path: string, routeRecords: RouteRecord[]) {
  for (const r of routeRecords) {
    if (routeToRegex(r.path).test(path))
      return r
  }
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
    const pathname = typeof entry === 'string' ? new URL(entry).pathname : new URL(entry.loc).pathname
    const matched = matchRoute(pathname, routes as RouteRecord[])
    return {
      route: pathname,
      ...(typeof entry !== 'string' && entry.lastmod && { lastmod: entry.lastmod }),
      ...(matched?.name && { name: matched.name }),
      ...(matched?.meta && { meta: matched.meta }),
    }
  })
}
