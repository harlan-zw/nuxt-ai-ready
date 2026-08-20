import type { ContentNegotiationResult } from '@mdream/js/negotiate'
import type { H3Event } from '#nuxtseo/h3'
import { negotiateContent } from '@mdream/js/negotiate'
import { getBotInfo } from '@nuxtjs/robots/util'
import { getHeaders } from '#nuxtseo/h3'

/**
 * Lower-cased request headers plus the request path. Every negotiation input is
 * captured here so the decision logic stays pure and testable.
 */
export interface MarkdownRequest {
  /** Base-relative request path. May carry a query string. */
  path: string
  /** Header names must be lower-case, as `getHeaders()` returns them. */
  headers: Record<string, string | undefined>
  /** True while Nitro prerenders the site. */
  isPrerender: boolean
}

export function toMarkdownRequest(event: H3Event, isPrerender = !!import.meta.prerender): MarkdownRequest {
  return { path: event.path, headers: getHeaders(event), isPrerender }
}

// Pure counterpart of negotiateRepresentation: layers AI bot detection on top
// of Accept header negotiation. AI bots get markdown unless navigating a browser.
export function negotiateRequestRepresentation(request: MarkdownRequest): ContentNegotiationResult {
  if (request.isPrerender || request.headers['x-nitro-prerender'])
    return 'html'

  const accept = request.headers.accept
  const secFetchDest = request.headers['sec-fetch-dest']

  if (negotiateContent(accept) === 'markdown')
    return 'markdown'

  if (secFetchDest === 'document')
    return 'html'

  const botInfo = getBotInfo(request.headers)
  if (botInfo?.category === 'ai')
    return 'markdown'

  return negotiateContent(accept, secFetchDest)
}

// H3 wrapper over the pure negotiation above.
export function negotiateRepresentation(event: H3Event): ContentNegotiationResult {
  return negotiateRequestRepresentation(toMarkdownRequest(event))
}

export type MarkdownRequestMode
  = | { _tag: 'runtime', contentNegotiation: boolean }
    | { _tag: 'prerender' }

export type MarkdownRenderInfo
  = | { path: string, isExplicit: boolean, negotiation: ContentNegotiationResult }
    | { notAcceptable: true }
    | null

export function getRequestRenderInfo(
  request: MarkdownRequest,
  mode: MarkdownRequestMode = { _tag: 'runtime', contentNegotiation: true },
): MarkdownRenderInfo {
  const queryIndex = request.path.indexOf('?')
  const originalPath = queryIndex === -1 ? request.path : request.path.slice(0, queryIndex)
  const isPrerender = mode._tag === 'prerender'

  if (originalPath.startsWith('/api') || originalPath.startsWith('/_') || originalPath.startsWith('/@'))
    return null

  const accept = request.headers.accept || ''
  if (!originalPath.endsWith('.md') && accept
    && /\b(?:application\/json|text\/event-stream)\b/i.test(accept)
    && !/text\/(?:html|markdown|plain)\b|\*\/\*/i.test(accept)) {
    return null
  }

  const isExplicit = originalPath.endsWith('.md')
  if (isPrerender && !isExplicit)
    return null

  const lastSegment = originalPath.split('/').pop() || ''
  const hasExtension = lastSegment.includes('.')
  const extension = hasExtension ? lastSegment.substring(lastSegment.lastIndexOf('.')) : ''
  if (hasExtension && extension !== '.md')
    return null

  const negotiation: ContentNegotiationResult = isPrerender
    ? 'markdown'
    : mode.contentNegotiation
      ? negotiateRequestRepresentation(request)
      : 'html'

  if (isExplicit) {
    const path = normalizePath(originalPath.slice(0, -3))
    return { path, isExplicit: true, negotiation: 'markdown' }
  }

  if (negotiation === 'not-acceptable')
    return { notAcceptable: true }

  return { path: normalizePath(originalPath), isExplicit: false, negotiation }
}

export function getMarkdownRenderInfo(
  event: H3Event,
  mode: MarkdownRequestMode = { _tag: 'runtime', contentNegotiation: true },
): MarkdownRenderInfo {
  return getRequestRenderInfo(toMarkdownRequest(event), mode)
}

function normalizePath(path: string): string {
  if (path.endsWith('/index'))
    return path.slice(0, -5) || '/'
  return path
}

export function clientPrefersMarkdown(event: H3Event): boolean {
  return negotiateRepresentation(event) === 'markdown'
}
