import type { AppRouteRules } from 'nuxt/server'
import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { NegotiationRouteRule } from './content-negotiation'
import type { RuntimeRouteContext } from './i18n'
import type { NegotiationDecision, NegotiationStage } from './negotiation-decision'
import { createNitroRouteRuleMatcher } from 'nuxtseo-shared/server'
import { localAgentSkillArtifacts } from '#ai-ready-virtual/agent-skills.mjs'
import { appendHeader, createError, getHeader, getRequestHost, getRequestURL, getResponseHeader, sendRedirect, setHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { createSitePathResolver, withSiteUrl } from '#site-config/server/composables/utils'
import { initRequestSiteConfig } from '#site-config/server/init'
import { toMarkdownPath } from '../../markdown-path'
import { toDeployedRoute } from '../../route-path'
import { setStatusAwareLinkHeader } from '../plugins/link-header'
import { CONTENT_NEGOTIATION_VARY } from './content-negotiation'
import { buildLinkHeader, buildStatusAwareLinkHeaders } from './link-header'
import { toMarkdownRequest } from './markdown-request'
import { resolveNegotiationDecision } from './negotiation-decision'

/** Set once the negotiation headers are on the response, so nothing repeats them. */
const APPLIED_KEY = 'nuxt-ai-ready:negotiation-applied'

let artifactPaths: ReadonlySet<string> | undefined

/** Routes an agent skill answers verbatim; negotiation must not render them. */
export function agentSkillArtifactPaths(): ReadonlySet<string> {
  artifactPaths ??= new Set(Object.keys(localAgentSkillArtifacts))
  return artifactPaths
}

export type LinkUrlResolver = (path: string) => string

export interface NegotiationContext {
  config: ModulePublicRuntimeConfig
  path: string
  resolvePath: LinkUrlResolver
  resolveUrl: LinkUrlResolver
  routeContext: RuntimeRouteContext
}

type NegotiationResponse = Awaited<ReturnType<typeof sendRedirect>> | undefined

function createHeaderUrlResolver(event: H3Event, ctx: NegotiationContext): LinkUrlResolver {
  // Capture site configuration only for this synchronous header build. The
  // context's live resolver still observes changes after asynchronous hooks.
  let resolveUrl: LinkUrlResolver | undefined
  return (path) => {
    // Keep setup inside the builder's existing relative-link error fallback.
    resolveUrl ??= createSitePathResolver(event, { absolute: true, withBase: true })
    return resolveUrl(ctx.resolvePath(path))
  }
}

export function setLinkHeader(event: H3Event, ctx: NegotiationContext, variant: 'html' | 'markdown') {
  setHeader(event, 'link', buildLinkHeader(ctx.path, variant, ctx.config, createHeaderUrlResolver(event, ctx), ctx.routeContext))
}

export function setStatusAwareHeader(event: H3Event, ctx: NegotiationContext, variant: 'html' | 'markdown') {
  if (!ctx.config.i18n) {
    setLinkHeader(event, ctx, variant)
    return
  }

  const headers = buildStatusAwareLinkHeaders(ctx.path, variant, ctx.config, createHeaderUrlResolver(event, ctx), ctx.routeContext)
  setStatusAwareLinkHeader(event, headers.error, headers.success)
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

export function setMarkdownHeaders(event: H3Event, ctx: NegotiationContext, sourceHeaders?: Headers) {
  setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
  setLinkHeader(event, ctx, 'markdown')
  // A representation change must not turn a private response into public content.
  const privateResponse = [
    'cache-control',
    'cdn-cache-control',
    'cloudflare-cdn-cache-control',
    'netlify-cdn-cache-control',
    'vercel-cdn-cache-control',
    'surrogate-control',
  ].some((header) => {
    const value = `${getResponseHeader(event, header) || ''},${sourceHeaders?.get(header) || ''}`
    return /(?:^|,)\s*(?:private|no-store|no-cache)\s*(?:,|=|$)/i.test(value)
  })
  if (getHeader(event, 'cookie') || getHeader(event, 'authorization')
    || getResponseHeader(event, 'set-cookie') || sourceHeaders?.has('set-cookie') || privateResponse) {
    setUncacheableHeaders(event)
    return
  }
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
    await initRequestSiteConfig(event, getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin, createNitroRouteRuleMatcher<AppRouteRules>(useRuntimeConfig(event))(event.path))
}

export function buildNegotiationContext(event: H3Event, path: string): NegotiationContext {
  const runtimeConfig = useRuntimeConfig(event)
  const baseURL = runtimeConfig.app.baseURL
  const resolvePath = (target: string) => toDeployedRoute(target, baseURL)
  return {
    config: runtimeConfig['nuxt-ai-ready'] as ModulePublicRuntimeConfig,
    path,
    resolvePath,
    resolveUrl: (target: string) => withSiteUrl(event, resolvePath(target), { withBase: true }),
    routeContext: { host: getRequestHost(event, { xForwardedHost: true }) },
  }
}

type RouteRuleMatcher = (path: string) => NegotiationRouteRule

const REQUEST_DECISION = Symbol('nuxt-ai-ready:negotiation')

interface RequestDecision {
  owner: object
  path: string
  policy: ModulePublicRuntimeConfig['contentNegotiation']
  decision: NegotiationDecision
}

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
  const context = event.context as typeof event.context & { [REQUEST_DECISION]?: RequestDecision }
  const owner = event.node?.req ?? event.req ?? event
  let cached = context[REQUEST_DECISION]
  if (!cached || cached.owner !== owner || cached.path !== event.path || cached.policy !== config.contentNegotiation) {
    cached = {
      owner,
      path: event.path,
      policy: config.contentNegotiation,
      decision: resolveNegotiationDecision({
        stage: 'middleware',
        request: toMarkdownRequest(event),
        routeRule: getRouteRuleMatcher(runtimeConfig)(event.path),
        policy: config.contentNegotiation,
        artifactPaths: agentSkillArtifactPaths(),
      }),
    }
    context[REQUEST_DECISION] = cached
  }
  // Explicit Markdown must still wait behind static assets and auth middleware.
  return stage === 'early' && cached.decision._tag === 'render'
    ? { _tag: 'skip', reason: 'deferred' }
    : cached.decision
}

/**
 * Apply one negotiation decision to the response.
 *
 * Returns the response value when H3 requires one. Pass-through and `render`
 * decisions return undefined because the caller owns the next step.
 */
export async function applyNegotiation(event: H3Event, decision: NegotiationDecision): Promise<NegotiationResponse> {
  if (decision._tag === 'skip' || decision._tag === 'render')
    return

  // The early handler and the middleware both run for a pass-through request.
  // Without this guard the second pass appends a duplicate Vary header.
  const context = event.context as Record<string, unknown>
  if (context[APPLIED_KEY])
    return
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
    return
  }

  // Implicit markdown: redirect to the `.md` twin so the prerendered file (or
  // the `.md` handler) answers. This keeps HTML and Markdown under separate
  // cache keys, which matters on CDNs that ignore Vary.
  appendHeader(event, 'vary', CONTENT_NEGOTIATION_VARY)
  setLinkHeader(event, ctx, 'html')
  setUncacheableHeaders(event)
  return sendRedirect(event, ctx.resolvePath(toMarkdownPath(decision.path)), 307)
}
