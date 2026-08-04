import type { NitroRouteRules } from 'nitropack/types'
import type { ContentNegotiationPolicy } from '../../types'

export const CONTENT_NEGOTIATION_VARY = 'Accept, Sec-Fetch-Dest, User-Agent'

const NEGOTIATION_CACHE_HEADERS = CONTENT_NEGOTIATION_VARY
  .split(',')
  .map(header => header.trim().toLowerCase())

type RouteRule = Pick<NitroRouteRules, 'cache' | 'isr'>

export type ContentNegotiationResolution
  = | { _tag: 'enabled', source: 'default' | 'explicit' }
    | { _tag: 'disabled', source: 'explicit' | 'isr' | 'route-cache' }

function cachesWithoutNegotiationVariation(cache: RouteRule['cache']): boolean {
  if (!cache)
    return false
  if (typeof cache !== 'object')
    return true
  if (cache.headersOnly)
    return false

  const varies = new Set(cache.varies?.map(header => header.toLowerCase()))
  return NEGOTIATION_CACHE_HEADERS.some(header => !varies.has(header))
}

export function resolveContentNegotiation(input: {
  policy: ContentNegotiationPolicy
  routeRule: RouteRule
}): ContentNegotiationResolution {
  if (input.policy === 'enabled')
    return { _tag: 'enabled', source: 'explicit' }
  if (input.policy === 'disabled')
    return { _tag: 'disabled', source: 'explicit' }

  if (input.routeRule.isr)
    return { _tag: 'disabled', source: 'isr' }

  if (cachesWithoutNegotiationVariation(input.routeRule.cache))
    return { _tag: 'disabled', source: 'route-cache' }

  return { _tag: 'enabled', source: 'default' }
}
