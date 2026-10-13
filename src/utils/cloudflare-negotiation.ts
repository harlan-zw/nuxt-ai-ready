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

function parentDirectories(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  return segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join('/')}/`)
}

/**
 * Collapse exact page paths into directory globs until they fit the budget.
 *
 * Each round globs the directory that saves the most entries, the deepest
 * one on a tie so fewer unrelated paths reach the Worker. A glob covers
 * only paths below its directory, so a directory's own page keeps its exact
 * entries. Top-level pages have no directory to glob; a root glob would send
 * every asset request through the Worker, so it is never chosen.
 */
function fitWorkerFirstBudget(paths: readonly string[], budget: number): string[] | undefined {
  let remaining = [...paths]
  const globs: string[] = []
  while (remaining.length + globs.length > budget) {
    const counts = new Map<string, number>()
    for (const path of remaining) {
      for (const directory of parentDirectories(path))
        counts.set(directory, (counts.get(directory) ?? 0) + 1)
    }
    let best: [directory: string, count: number] | undefined
    for (const [directory, count] of counts) {
      if (!best || count > best[1] || (count === best[1] && directory.length > best[0].length))
        best = [directory, count]
    }
    if (!best || best[1] < 2)
      return undefined
    const [directory] = best
    globs.push(`${directory}*`)
    remaining = remaining.filter(path => !path.startsWith(directory) || path === directory)
  }
  return [...remaining, ...globs]
}

/**
 * The worker-first patterns to add so every prerendered page reaches the
 * Worker: exact page paths while they fit Cloudflare's 100-entry limit, and
 * directory globs once they do not.
 */
export function cloudflareWorkerFirstAdditions(existing: boolean | string[] | undefined, pages: readonly string[]): string[] {
  if (existing === true || existing === false || pages.length === 0)
    return []
  const patterns = existing || []
  const paths = cloudflareStaticFallbackPaths(existing, pages).filter(path => !patterns.includes(path))
  const additions = fitWorkerFirstBudget(paths, MAX_WORKER_FIRST_PATTERNS - patterns.length)
  if (!additions) {
    throw new Error('Cloudflare Markdown negotiation exceeds 100 worker-first patterns, even with directory globs. Configure broader assets.run_worker_first patterns, or disable aiReady.contentNegotiation.')
  }
  return additions
}

/** Keep explicit exclusions and existing asset routing while adding only page paths. */
export function cloudflareNegotiationPatterns(existing: boolean | string[] | undefined, pages: readonly string[]): boolean | string[] | undefined {
  if (existing === true || existing === false || pages.length === 0)
    return existing
  return [...existing || [], ...cloudflareWorkerFirstAdditions(existing, pages)]
}
