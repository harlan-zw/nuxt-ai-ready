import type { ContentNegotiationPolicy } from '../../types'
import type { ContentNegotiationResolution, NegotiationRouteRule } from './content-negotiation'
import type { MarkdownRequest } from './markdown-request'
import { resolveContentNegotiation } from './content-negotiation'
import { getRequestRenderInfo } from './markdown-request'

/** Marks the internal HTML fetch that the explicit `.md` handler makes. */
export const INTERNAL_HEADER = 'x-ai-ready-internal'

/**
 * Where the decision runs. The early stage sits in front of the Nitro static
 * asset handler, so it must leave explicit `.md` requests to the middleware.
 */
export type NegotiationStage = 'early' | 'middleware'

export interface NegotiationInput {
  stage: NegotiationStage
  request: MarkdownRequest
  routeRule: NegotiationRouteRule
  policy: ContentNegotiationPolicy
}

export type NegotiationDecision
  = | { _tag: 'skip', reason: 'well-known' | 'internal' | 'not-a-page' | 'deferred' }
    | { _tag: 'not-acceptable' }
    | { _tag: 'html', path: string, negotiation: ContentNegotiationResolution }
    | { _tag: 'redirect', path: string }
    | { _tag: 'render', path: string }

/**
 * Decide how one request maps to an HTML or Markdown representation.
 *
 * Pure: every input arrives as data, so the same call answers the same way for
 * the early handler, the middleware and unit tests.
 */
export function resolveNegotiationDecision(input: NegotiationInput): NegotiationDecision {
  const { request, stage } = input
  const path = withoutQuery(request.path)

  if (path.startsWith('/.well-known/'))
    return { _tag: 'skip', reason: 'well-known' }

  // The explicit `.md` handler fetches its own HTML. Never negotiate that fetch.
  if (request.headers[INTERNAL_HEADER])
    return { _tag: 'skip', reason: 'internal' }

  const negotiation = resolveContentNegotiation({ policy: input.policy, routeRule: input.routeRule })
  const renderInfo = getRequestRenderInfo(request, {
    _tag: 'runtime',
    contentNegotiation: negotiation._tag === 'enabled',
  })
  if (!renderInfo)
    return { _tag: 'skip', reason: 'not-a-page' }

  if ('notAcceptable' in renderInfo)
    return { _tag: 'not-acceptable' }

  if (renderInfo.isExplicit) {
    // The early stage never renders. A prerendered `.md` file answers first, and
    // rendering belongs behind any auth middleware the site registers.
    return stage === 'early'
      ? { _tag: 'skip', reason: 'deferred' }
      : { _tag: 'render', path: renderInfo.path }
  }

  if (renderInfo.negotiation === 'markdown')
    return { _tag: 'redirect', path: renderInfo.path }

  return { _tag: 'html', path: renderInfo.path, negotiation }
}

function withoutQuery(path: string): string {
  const queryIndex = path.indexOf('?')
  return queryIndex === -1 ? path : path.slice(0, queryIndex)
}
