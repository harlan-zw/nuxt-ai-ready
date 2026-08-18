import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { NegotiationRouteRule } from './content-negotiation'
import type { RuntimeRouteContext } from './i18n'
import type { NegotiationDecision, NegotiationStage } from './negotiation-decision'
import { createNitroRouteRuleMatcher } from 'nuxtseo-shared/server'
import { appendHeader, createError, getRequestURL, getResponseHeader, sendRedirect, setHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { withSiteUrl } from '#site-config/server/composables/utils'
import initSiteConfig from '#site-config/server/middleware/init'
import { toMarkdownPath } from '../../markdown-path'
import { toDeployedRoute } from '../../route-path'
import { setStatusAwareLinkHeader } from '../plugins/link-header'
import { CONTENT_NEGOTIATION_VARY } from './content-negotiation'
import { buildLinkHeader } from './link-header'
import { toMarkdownRequest } from './markdown-request'
import { resolveNegotiationDecision } from './negotiation-decision'

/** Set once the negotiation headers are on the response, so nothing repeats them. */
const APPLIED_KEY = 'nuxt-ai-ready:negotiation-applied'

export type LinkUrlResolver = (path: string) => string

export interface NegotiationContext {
  config: ModulePublicRuntimeConfig
  path: string
  resolvePath: LinkUrlResolver
  resolveUrl: LinkUrlResolver
  routeContext: RuntimeRouteContext
}

export function setLinkHeader(event: H3Event, ctx: NegotiationContext, variant: 'html' | 'markdown') {
  setHeader(event, 'link', buildLinkHeader(ctx.path, variant, ctx.config, ctx.resolveUrl, ctx.routeContext))
}

export function setStatusAwareHeader(event: H3Event, ctx: NegotiationContext, variant: 'html' | 'markdown') {
  const successHeader = buildLinkHeader(ctx.path, variant, ctx.config, ctx.resolveUrl, ctx.routeContext)
  if (!ctx.config.i18n) {
    setHeader(event, 'link', successHeader)
    return
  }

  const safeHeader = buildLinkHeader(ctx.path, variant, { ...ctx.config, i18n: null }, ctx.resolveUrl, ctx.routeContext)
  setStatusAwareLinkHeader(event, safeHeader, successHeader)
}

export function setUncacheableHeaders(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'cdn-cache-control', 'no-store')

  for (const header of [
    'cloudflare-cdn-cache-control',
    'netlify-cdn-cache-control',
    'vercel-cdn-cache-control',
    'surrogate-control',
  ] as const) {
    if (getResponseHeader(event, header) !== undefined)
      setHeader(event, header, 'no-store')
  }
}

export function setMarkdownHeaders(event: H3Event, ctx: NegotiationContext) {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setLinkHeader(event, ctx, 'markdown')
  const cacheHeaders = ctx.config.markdownCacheHeaders
  if (cacheHeaders) {
    const { maxAge, swr } = cacheHeaders
    setHeader(event, 'cache-control', swr
      ? `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`
      : `public, max-age=${maxAge}`)
  }
}

/**
 * Site config is set up by a Nitro middleware. The early negotiation handler
 * runs in front of that middleware, so it must run the setup itself before it
 * builds absolute URLs. The setup is idempotent.
 */
export async function ensureSiteConfig(event: H3Event): Promise<void> {
  if (!(event.context as { _initedSiteConfig?: boolean })._initedSiteConfig)
    await initSiteConfig(event)
}

export function buildNegotiationContext(event: H3Event, path: string): NegotiationContext {
  const runtimeConfig = useRuntimeConfig(event)
  const baseURL = runtimeConfig.app.baseURL
  const resolvePath = (target: string) => toDeployedRoute(target, baseURL)
  return {
    config: runtimeConfig['nuxt-ai-ready'] as ModulePublicRuntimeConfig,
    path,
    resolvePath,
    resolveUrl: (target: string) => withSiteUrl(event, resolvePath(target)),
    routeContext: { host: getRequestURL(event).host },
  }
}

type RouteRuleMatcher = (path: string) => NegotiationRouteRule

// The matcher compiles a radix router from the route rules. Route rules never
// change while the server runs, so reuse the matcher per runtime config.
let matcherCache: { config: object, match: RouteRuleMatcher } | undefined

function getRouteRuleMatcher(runtimeConfig: object): RouteRuleMatcher {
  if (matcherCache?.config !== runtimeConfig)
    matcherCache = { config: runtimeConfig, match: createNitroRouteRuleMatcher(runtimeConfig) as RouteRuleMatcher }
  return matcherCache.match
}

export function decideNegotiation(event: H3Event, stage: NegotiationStage): NegotiationDecision {
  const runtimeConfig = useRuntimeConfig(event)
  const config = runtimeConfig['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  return resolveNegotiationDecision({
    stage,
    request: toMarkdownRequest(event),
    routeRule: getRouteRuleMatcher(runtimeConfig)(event.path),
    policy: config.contentNegotiation,
  })
}

/**
 * Apply one negotiation decision to the response.
 *
 * Returns true when the response is complete. `render` decisions return false,
 * because the caller owns Markdown rendering.
 */
export async function applyNegotiation(event: H3Event, decision: NegotiationDecision): Promise<boolean> {
  if (decision._tag === 'skip' || decision._tag === 'render')
    return false

  // The early handler and the middleware both run for a pass-through request.
  // Without this guard the second pass appends a duplicate Vary header.
  const context = event.context as Record<string, unknown>
  if (context[APPLIED_KEY])
    return false
  context[APPLIED_KEY] = true

  if (decision._tag === 'not-acceptable') {
    appendHeader(event, 'vary', CONTENT_NEGOTIATION_VARY)
    setUncacheableHeaders(event)
    throw createError({
      statusCode: 406,
      statusMessage: 'Not Acceptable',
      message: 'Supported types: text/html, text/markdown, text/plain',
    })
  }

  await ensureSiteConfig(event)
  const ctx = buildNegotiationContext(event, decision.path)

  // Implicit HTML pass-through: advertise the Markdown alternate and let the
  // HTML response continue.
  if (decision._tag === 'html') {
    if (decision.negotiation._tag === 'enabled')
      appendHeader(event, 'vary', CONTENT_NEGOTIATION_VARY)
    setStatusAwareHeader(event, ctx, 'html')
    return false
  }

  // Implicit markdown: redirect to the `.md` twin so the prerendered file (or
  // the `.md` handler) answers. This keeps HTML and Markdown under separate
  // cache keys, which matters on CDNs that ignore Vary.
  appendHeader(event, 'vary', CONTENT_NEGOTIATION_VARY)
  setLinkHeader(event, ctx, 'html')
  setUncacheableHeaders(event)
  await sendRedirect(event, ctx.resolvePath(toMarkdownPath(decision.path)), 307)
  return true
}
