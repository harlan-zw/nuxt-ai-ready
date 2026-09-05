import { normalizePagePath } from '../runtime/markdown-path'
import { toDeployedRoute } from '../runtime/route-path'

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
