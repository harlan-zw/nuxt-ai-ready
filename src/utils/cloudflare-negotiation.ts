import { normalizePagePath } from '../runtime/markdown-path'
import { toDeployedRoute } from '../runtime/route-path'
import { isStaticMarkdownSourceRoute } from './static-markdown-headers'

const MAX_WORKER_FIRST_PATTERNS = 100
const RE_PATTERN_CHARACTERS = /[.+?^${}()|[\]\\]/g

export function cloudflarePrerenderedPages(
  routes: ReadonlyArray<{ route: string, fileName?: string, error?: unknown }>,
  baseURL: string,
): string[] {
  return [...new Set(routes
    .filter(entry => !entry.error && entry.fileName?.endsWith('.html') && isStaticMarkdownSourceRoute(entry.route))
    .map(entry => normalizePagePath(toDeployedRoute(normalizePagePath(entry.route), baseURL))))]
}

function matchesPattern(path: string, pattern: string): boolean {
  return new RegExp(`^${pattern.replace(RE_PATTERN_CHARACTERS, '\\$&').replaceAll('*', '.*')}$`).test(path)
}

function pagePaths(pages: readonly string[]): string[] {
  return pages.flatMap(page => page === '/' ? ['/'] : [page, `${page}/`])
}

/** Only newly selected paths were served publicly before the module changed routing. */
export function cloudflareStaticFallbackPaths(existing: boolean | string[] | undefined, pages: readonly string[], environments: ReadonlyArray<boolean | string[]> = []): string[] {
  if (existing === true || existing === false || environments.includes(true))
    return []
  const patterns = [...existing || [], ...environments.flatMap(routing => Array.isArray(routing) ? routing : [])]
  return pagePaths(pages).filter(path => !patterns.some(pattern => matchesPattern(path, pattern.startsWith('!') ? pattern.slice(1) : pattern)))
}

/** Keep explicit exclusions and existing asset routing while adding only page paths. */
export function cloudflareNegotiationPatterns(existing: boolean | string[] | undefined, pages: readonly string[]): boolean | string[] | undefined {
  if (existing === true || existing === false || pages.length === 0)
    return existing

  const patterns = [...existing || []]
  for (const path of cloudflareStaticFallbackPaths(existing, pages)) {
    if (!patterns.includes(path))
      patterns.push(path)
  }
  if (patterns.length > MAX_WORKER_FIRST_PATTERNS) {
    throw new Error('Cloudflare Markdown negotiation exceeds 100 worker-first patterns. Configure broader assets.run_worker_first patterns, or disable aiReady.contentNegotiation.')
  }
  return patterns
}
