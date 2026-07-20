import { joinURL, parseURL, withLeadingSlash, withoutBase } from 'ufo'
import { normalizePagePath } from './markdown-path'

/** Convert a sitemap URL (which includes app.baseURL) to a logical route. */
export function toLogicalRoute(pathOrUrl: string, baseURL: string): string {
  const pathname = withLeadingSlash(parseURL(pathOrUrl).pathname)
  return normalizePagePath(withoutBase(pathname, baseURL))
}

/** Apply app.baseURL to a logical route exactly once. */
export function toDeployedRoute(route: string, baseURL: string): string {
  return joinURL(baseURL, withLeadingSlash(route))
}

/**
 * Normalize rows written by older releases, which stored deployed paths.
 * A sitemap match disambiguates those rows from real logical routes whose
 * first segment happens to match app.baseURL.
 */
export function normalizePersistedRoute(
  route: string,
  sitemapRoutes: ReadonlySet<string>,
  baseURL: string,
): string {
  const normalizedRoute = normalizePagePath(withLeadingSlash(parseURL(route).pathname))
  if (sitemapRoutes.has(normalizedRoute))
    return normalizedRoute

  const logicalRoute = toLogicalRoute(normalizedRoute, baseURL)
  return sitemapRoutes.has(logicalRoute) ? logicalRoute : normalizedRoute
}
