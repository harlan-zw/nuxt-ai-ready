import { defu } from 'defu'
import { mergeVaryHeader } from '../runtime/cache-control'
import { hasMarkdownTwin, normalizePagePath, toMarkdownPath } from '../runtime/markdown-path'
import { toDeployedRoute } from '../runtime/route-path'
import { SITEMAP_MD_ROUTE } from '../runtime/server/utils/sitemap-md'

const RE_MD_EXT = /\.md$/

/**
 * A route Nitro prerenders as a page, so the module generates a `.md` twin for
 * it. Pattern and dynamic routes cannot carry an exact Link header.
 */
export function isStaticMarkdownSourceRoute(route: string): boolean {
  if (route.includes('*') || route.includes(':'))
    return false
  return hasMarkdownTwin(route.split('?')[0] || route)
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
 * list, so `_prerenderedRoutes` is the only complete source. Agent-skill
 * artifact routes are real files served verbatim, not page twins, so they
 * are excluded.
 */
export function prerenderedMarkdownHeaderRules(
  prerenderedRoutes: ReadonlyArray<{ route?: string, fileName?: string }>,
  baseURL: string,
  describedby: boolean,
  artifactRoutes: ReadonlyArray<string>,
): StaticMarkdownHeaderRule[] {
  const artifacts = new Set(artifactRoutes)
  const rules = new Map<string, StaticMarkdownHeaderRule>()
  for (const entry of prerenderedRoutes) {
    if ((entry.route !== undefined && artifacts.has(entry.route))
      || (entry.fileName !== undefined && artifacts.has(entry.fileName))) {
      continue
    }
    const pageRoute = pageRouteFromMarkdownTwin(entry.fileName)
    if (pageRoute === null)
      continue
    const mdRoute = toMarkdownPath(pageRoute)
    if (!rules.has(mdRoute)) {
      rules.set(mdRoute, {
        route: mdRoute,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Vary': 'Accept',
          'Link': buildStaticMarkdownLinkHeader(pageRoute, baseURL, describedby),
        },
      })
    }
  }
  return [...rules.values()]
}

const RE_EXACT_MARKDOWN_ROUTE = /^\/[^*:\s]*\.md$/

/** A route rule Nitro's Cloudflare presets write into `_headers`: any rule carrying headers. */
function isStaticHeaderRouteRule([, rule]: [string, object | undefined]): boolean {
  return Boolean(rule && 'headers' in rule && rule.headers)
}

export type StaticMarkdownHeaderPlan
  = | { _tag: 'apply', rules: StaticMarkdownHeaderRule[] }
    | {
      _tag: 'skip'
      /** Exact `.md` route rules already registered that the caller must remove. */
      drop: string[]
      /** Rules `_headers` would have held with every twin included. */
      total: number
      /** Twins that lose their per-page rule. */
      dropped: number
    }

/**
 * Whether the per-page `.md` rules fit the host's `_headers` budget.
 *
 * Nitro writes one `_headers` rule per route rule that carries headers, and
 * Cloudflare rejects the file past its limit, which fails the deploy. The
 * decision happens here, on the route rules, so the file is never over budget
 * at any point in the build; a module auditing `_headers` earlier in the
 * `compiled` hook order sees it already trimmed. Over budget, every exact
 * `.md` rule goes, including the ones registered at config time, and the
 * `/*.md` glob keeps the charset and describedby entries.
 */
export function planStaticMarkdownHeaderRules(
  routeRules: Record<string, object | undefined>,
  rules: StaticMarkdownHeaderRule[],
  limit: number | null,
): StaticMarkdownHeaderPlan {
  if (limit === null)
    return { _tag: 'apply', rules }
  const entries = Object.entries(routeRules).filter(isStaticHeaderRouteRule)
  const registeredMarkdown = entries.map(([route]) => route).filter(route => RE_EXACT_MARKDOWN_ROUTE.test(route))
  const other = entries.length - registeredMarkdown.length
  const markdown = new Set([...registeredMarkdown, ...rules.map(rule => rule.route)])
  const total = other + markdown.size
  if (total <= limit)
    return { _tag: 'apply', rules }
  return { _tag: 'skip', drop: registeredMarkdown, total, dropped: markdown.size }
}

/**
 * Apply the plan to the route rules: merge in the twin rules on `apply`.
 * Over budget, only the headers entry goes: Nitro's Cloudflare presets skip
 * rules with falsy headers, and the rest of the rule (redirect, etc.) keeps
 * working.
 */
export function applyStaticMarkdownHeaderPlan(
  routeRules: Record<string, object | undefined>,
  plan: StaticMarkdownHeaderPlan,
): void {
  if (plan._tag === 'skip') {
    for (const route of plan.drop) {
      const rule = routeRules[route] as { headers?: unknown } | undefined
      if (rule)
        rule.headers = undefined
    }
    return
  }
  for (const { route, headers } of plan.rules) {
    const existing = routeRules[route] as { headers?: Record<string, string> } | undefined
    const merged = defu({ headers }, existing)
    const vary = Object.entries(existing?.headers || {})
      .filter(([name]) => name.toLowerCase() === 'vary')
      .map(([, value]) => value)
      .join(', ')
    if (headers.Vary) {
      for (const name of Object.keys(merged.headers)) {
        if (name.toLowerCase() === 'vary')
          delete merged.headers[name]
      }
      merged.headers.Vary = mergeVaryHeader(vary, headers.Vary)
    }
    routeRules[route] = merged
  }
}
