export interface SitemapRouteSource {
  loc: string
  _path?: { pathname: string } | null
}

/** Normalize sitemap URL records into the route map used by the page store. */
export function mapSitemapRoutes<T extends SitemapRouteSource>(urls: readonly T[]): Map<string, T> {
  const routeToUrl = new Map<string, T>()
  for (const url of urls) {
    const route = url._path?.pathname
      ?? (url.loc.startsWith('/') ? (url.loc.split('?')[0] ?? url.loc) : new URL(url.loc).pathname)
    if (!route.includes('.'))
      routeToUrl.set(route, url)
  }
  return routeToUrl
}
