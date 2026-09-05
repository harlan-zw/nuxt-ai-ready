import { normalizePagePath, toMarkdownPath } from '../runtime/markdown-path'
import { toDeployedRoute } from '../runtime/route-path'
import { SITEMAP_MD_ROUTE } from '../runtime/server/utils/sitemap-md'

const RE_MD_EXT = /\.md$/

/**
 * A route Nitro prerenders as a page, so the module generates a `.md` twin for
 * it. Pattern and dynamic routes cannot carry an exact Link header, and paths
 * whose last segment holds an extension are treated as non-page files by
 * `getRequestRenderInfo`, so they never get a twin.
 */
export function isStaticMarkdownSourceRoute(route: string): boolean {
  if (route.includes('*') || route.includes(':'))
    return false
  const path = route.split('?')[0] || route
  if (path.startsWith('/api') || path.startsWith('/_') || path.startsWith('/@'))
    return false
  const lastSegment = path.split('/').pop() || ''
  return !lastSegment.includes('.')
}

/** Relative `rel="describedby"` entry pointing at llms.txt. */
export function staticDescribedbyEntry(baseURL: string): string {
  return `<${encodeURI(toDeployedRoute('/llms.txt', baseURL))}>; rel="describedby"`
}

/**
 * Relative Link header entries for a prerendered `.md` file: the HTML route as
 * the alternate and canonical, llms.txt as describedby. Entries stay relative
 * so the header is valid on every origin a static build is served from.
 */
export function buildStaticMarkdownLinkHeader(route: string, baseURL: string, describedby: boolean): string {
  const htmlRoute = encodeURI(toDeployedRoute(normalizePagePath(route), baseURL))
  const parts = [
    `<${htmlRoute}>; rel="alternate"; type="text/html"`,
    `<${htmlRoute}>; rel="canonical"`,
  ]
  if (describedby)
    parts.push(staticDescribedbyEntry(baseURL))
  return parts.join(', ')
}

/**
 * The page route behind a file-backed `.md` twin Nitro wrote, or null when the
 * entry is not a page twin (HTML pages, sitemap.md, non-page assets).
 */
export function pageRouteFromMarkdownTwin(fileName: string | undefined): string | null {
  if (!fileName?.endsWith('.md') || fileName === SITEMAP_MD_ROUTE)
    return null
  const pageRoute = normalizePagePath(fileName.replace(RE_MD_EXT, ''))
  if (pageRoute === '/index')
    return '/'
  return isStaticMarkdownSourceRoute(pageRoute) ? pageRoute : null
}

/** Exact header rule for one prerendered `.md` file. */
export interface StaticMarkdownHeaderRule {
  route: string
  headers: Record<string, string>
}

/**
 * Exact rules for every markdown twin Nitro actually wrote during prerender.
 * Crawler-discovered twins never appear in the config-time prerender route
 * list, so `_prerenderedRoutes` is the only complete source.
 */
export function prerenderedMarkdownHeaderRules(
  prerenderedRoutes: ReadonlyArray<{ route?: string, fileName?: string }>,
  baseURL: string,
  describedby: boolean,
): StaticMarkdownHeaderRule[] {
  const rules = new Map<string, StaticMarkdownHeaderRule>()
  for (const entry of prerenderedRoutes) {
    const pageRoute = pageRouteFromMarkdownTwin(entry.fileName)
    if (pageRoute === null)
      continue
    const mdRoute = toMarkdownPath(pageRoute)
    if (!rules.has(mdRoute)) {
      rules.set(mdRoute, {
        route: mdRoute,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Link': buildStaticMarkdownLinkHeader(pageRoute, baseURL, describedby),
        },
      })
    }
  }
  return [...rules.values()]
}
