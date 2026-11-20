import type { AppRouteRules } from 'nuxt/server'
import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { RuntimeRouteContext } from './i18n'
import type { NegotiationDecision, NegotiationStage } from './negotiation-decision'
import { createNitroRouteRuleMatcher } from 'nuxtseo-shared/server'
import { decodePath } from 'ufo'
import { localAgentSkillArtifacts } from '#ai-ready-virtual/agent-skills.mjs'
import prerenderedMarkdownPaths from '#ai-ready-virtual/prerendered-markdown-paths.mjs'
import { appendHeader, createError, getHeader, getRequestHost, getRequestURL, getResponseHeader, sendRedirect, setHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import * as siteConfigUtils from '#site-config/server/composables/utils'
import { initRequestSiteConfig } from '#site-config/server/init'
import { mergeVaryHeader } from '../../cache-control'
import { toMarkdownPath } from '../../markdown-path'
import { toDeployedRoute } from '../../route-path'
import { setStatusAwareLinkHeader } from '../plugins/link-header'
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
  config: ModulePublicRuntimeConfig & { markdownAvailable?: false }
  path: string
  resolvePath: LinkUrlResolver
  resolveUrl: LinkUrlResolver
  routeContext: RuntimeRouteContext
}

type NegotiationResponse = Awaited<ReturnType<typeof sendRedirect>> | undefined

function createHeaderUrlResolver(event: H3Event, ctx: NegotiationContext): LinkUrlResolver {
  // `createSitePathResolver` was added after the supported Site Config floor.
  // Older versions retain the established resolver through the context.
  if (!siteConfigUtils.createSitePathResolver)
    return ctx.resolveUrl

  // Capture site configuration only for this synchronous header build. The
  // context's live resolver still observes changes after asynchronous hooks.
  let resolveUrl: LinkUrlResolver | undefined
  return (path) => {
    // Keep setup inside the builder's existing relative-link error fallback.
    resolveUrl ??= siteConfigUtils.createSitePathResolver(event, { absolute: true, withBase: true })
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
  // Usage policy survives a representation change. An explicit twin policy wins.
  const sourcePolicy = sourceHeaders?.get('content-signal')
  if (sourcePolicy !== null && sourcePolicy !== undefined && getResponseHeader(event, 'content-signal') === undefined)
    setHeader(event, 'content-signal', sourcePolicy)
  const vary = [getResponseHeader(event, 'vary'), sourceHeaders?.get('vary')].filter(Boolean).join(', ')
  setHeader(event, 'vary', mergeVaryHeader(vary, 'Accept'))
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
    await initRequestSiteConfig(event, getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin, getRouteRuleMatcher(useRuntimeConfig(event))(event.path))
}

export function buildNegotiationContext(event: H3Event, path: string): NegotiationContext {
  const runtimeConfig = useRuntimeConfig(event)
  const baseURL = runtimeConfig.app.baseURL
  const resolvePath = (target: string) => toDeployedRoute(target, baseURL)
  return {
    config: runtimeConfig['nuxt-ai-ready'] as ModulePublicRuntimeConfig,
    path,
    resolvePath,
    resolveUrl: (target: string) => siteConfigUtils.withSiteUrl(event, resolvePath(target), { withBase: true }),
    routeContext: { host: getRequestHost(event, { xForwardedHost: true }) },
  }
}

type RouteRuleMatcher = (path: string) => AppRouteRules

const REQUEST_DECISION = Symbol('nuxt-ai-ready:negotiation')

interface RequestDecision {
  owner: object
  path: string
  policy: ModulePublicRuntimeConfig['contentNegotiation']
  botNegotiation: boolean
  decision: NegotiationDecision
}

// Reuse the compiled radix router when request config copies have equal inputs.
let matcherCache: { key: string, match: RouteRuleMatcher } | undefined

function getRouteRuleMatcher(runtimeConfig: ReturnType<typeof useRuntimeConfig>): RouteRuleMatcher {
  const key = JSON.stringify([runtimeConfig.app?.baseURL, runtimeConfig.nitro?.routeRules])
  if (matcherCache?.key !== key)
    matcherCache = { key, match: createNitroRouteRuleMatcher<AppRouteRules>(runtimeConfig) }
  return matcherCache.match
}

export function decideNegotiation(event: H3Event, stage: NegotiationStage): NegotiationDecision {
  const context = event.context as typeof event.context & { [REQUEST_DECISION]?: RequestDecision }
  const owner = event.node?.req ?? event.req ?? event
  let cached = context[REQUEST_DECISION]
  let request: ReturnType<typeof toMarkdownRequest> | undefined
  if (!cached || cached.owner !== owner || cached.path !== event.path) {
    request = toMarkdownRequest(event)
    // A disabled policy still identifies every config-independent skip. Pages
    // continue below with event config, including request-time env overrides.
    const eligibility = resolveNegotiationDecision({
      stage: 'middleware',
      request,
      routeRule: {},
      policy: 'disabled',
      artifactPaths: agentSkillArtifactPaths(),
    })
    if (eligibility._tag === 'skip')
      return eligibility
  }
  const runtimeConfig = useRuntimeConfig(event)
  const config = runtimeConfig['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  if (!cached || cached.owner !== owner || cached.path !== event.path || cached.policy !== config.contentNegotiation || cached.botNegotiation !== config.botNegotiation) {
    const markdownPaths = prerenderedMarkdownPaths
    cached = {
      owner,
      path: event.path,
      policy: config.contentNegotiation,
      botNegotiation: config.botNegotiation,
      decision: resolveNegotiationDecision({
        stage: 'middleware',
        request: request ?? toMarkdownRequest(event),
        routeRule: getRouteRuleMatcher(runtimeConfig)(event.path),
        policy: config.contentNegotiation,
        botNegotiation: config.botNegotiation,
        artifactPaths: agentSkillArtifactPaths(),
        hasPrerenderedMarkdown: markdownPaths && !import.meta.prerender
          ? path => markdownPaths.has(decodePath(toDeployedRoute(path, runtimeConfig.app.baseURL)))
          : undefined,
      }),
    }
    context[REQUEST_DECISION] = cached
  }
  // Explicit Markdown must still wait behind static assets and auth middleware.
  return stage === 'early' && (cached.decision._tag === 'render' || cached.decision._tag === 'missing-markdown')
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
  if (decision._tag === 'skip' || decision._tag === 'render' || decision._tag === 'missing-markdown')
    return

  // The early handler and the middleware both run for a pass-through request.
  // Without this guard the second pass appends a duplicate Vary header.
  const context = event.context as Record<string, unknown>
  if (context[APPLIED_KEY])
    return
  context[APPLIED_KEY] = true

  if (decision._tag === 'not-acceptable') {
    appendHeader(event, 'vary', decision.vary)
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
      appendHeader(event, 'vary', decision.negotiation.vary)
    if (decision.markdownAvailable === false) {
      event.context.aiReadyMarkdownAvailable = false
      ctx.config = { ...ctx.config, markdownAvailable: false }
    }
    setStatusAwareHeader(event, ctx, 'html')
    return
  }

  // Implicit markdown: redirect to the `.md` twin so the prerendered file (or
  // the `.md` handler) answers. This keeps HTML and Markdown under separate
  // cache keys, which matters on CDNs that ignore Vary.
  appendHeader(event, 'vary', decision.vary)
  setLinkHeader(event, ctx, 'html')
  setUncacheableHeaders(event)
  return sendRedirect(event, ctx.resolvePath(toMarkdownPath(decision.path)), 307)
}
