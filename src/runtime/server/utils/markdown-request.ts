import type { ContentNegotiationResult } from '@mdream/js/negotiate'
import type { H3Event } from '#nuxtseo/h3'
import { negotiateContent } from '@mdream/js/negotiate'
import { getBotInfo } from '@nuxtjs/robots/util'
import { getHeader, getHeaders, getRequestURL } from '#nuxtseo/h3'

// H3 wrapper over @mdream/js/negotiate that layers AI bot detection on top of
// Accept header negotiation. AI bots get markdown unless navigating a browser.
export function negotiateRepresentation(event: H3Event): ContentNegotiationResult {
  if (import.meta.prerender || getHeader(event, 'x-nitro-prerender'))
    return 'html'

  const accept = getHeader(event, 'accept')
  const secFetchDest = getHeader(event, 'sec-fetch-dest')

  if (negotiateContent(accept) === 'markdown')
    return 'markdown'

  if (secFetchDest === 'document')
    return 'html'

  const botInfo = getBotInfo(getHeaders(event))
  if (botInfo?.category === 'ai')
    return 'markdown'

  return negotiateContent(accept, secFetchDest)
}

export type MarkdownRequestMode
  = | { _tag: 'runtime', contentNegotiation: boolean }
    | { _tag: 'prerender' }

export function getMarkdownRenderInfo(
  event: H3Event,
  mode: MarkdownRequestMode = { _tag: 'runtime', contentNegotiation: true },
):
  | { path: string, isExplicit: boolean, negotiation: ContentNegotiationResult }
  | { notAcceptable: true }
  | null {
  const originalPath = getRequestURL(event).pathname
  const isPrerender = mode._tag === 'prerender'

  if (originalPath.startsWith('/api') || originalPath.startsWith('/_') || originalPath.startsWith('/@'))
    return null

  const accept = getHeader(event, 'accept') || ''
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
      ? negotiateRepresentation(event)
      : 'html'

  if (isExplicit) {
    const path = normalizePath(originalPath.slice(0, -3))
    return { path, isExplicit: true, negotiation: 'markdown' }
  }

  if (negotiation === 'not-acceptable')
    return { notAcceptable: true }

  return { path: normalizePath(originalPath), isExplicit: false, negotiation }
}

function normalizePath(path: string): string {
  if (path.endsWith('/index'))
    return path.slice(0, -5) || '/'
  return path
}

export function clientPrefersMarkdown(event: H3Event): boolean {
  return negotiateRepresentation(event) === 'markdown'
}
