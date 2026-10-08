import type { ContentNegotiationPolicy } from '../../types'

export function getContentNegotiationVary(botNegotiation = false) {
  return botNegotiation ? 'Accept, Sec-Fetch-Dest, User-Agent' as const : 'Accept' as const
}

export interface NegotiationRouteRule {
  cache?: boolean | Record<string, unknown> & {
    headersOnly?: boolean
    varies?: readonly string[]
  }
  isr?: boolean | number | { expiration?: number | false }
}

export type ContentNegotiationResolution
  = | { _tag: 'enabled', source: 'default' | 'explicit', vary: ReturnType<typeof getContentNegotiationVary> }
    | { _tag: 'disabled', source: 'explicit' | 'isr' | 'route-cache' }

function cachesWithoutNegotiationVariation(cache: NegotiationRouteRule['cache'], botNegotiation: boolean): boolean {
  if (!cache)
    return false
  if (typeof cache !== 'object')
    return true
  if (cache.headersOnly)
    return false

  const varies = new Set(cache.varies?.map(header => header.toLowerCase()))
  return getContentNegotiationVary(botNegotiation).split(',').some(header => !varies.has(header.trim().toLowerCase()))
}

export function resolveContentNegotiation(input: {
  policy: ContentNegotiationPolicy
  botNegotiation?: boolean
  routeRule: NegotiationRouteRule
}): ContentNegotiationResolution {
  if (input.policy === 'enabled')
    return { _tag: 'enabled', source: 'explicit', vary: getContentNegotiationVary(input.botNegotiation) }
  if (input.policy === 'disabled')
    return { _tag: 'disabled', source: 'explicit' }

  if (input.routeRule.isr)
    return { _tag: 'disabled', source: 'isr' }

  if (cachesWithoutNegotiationVariation(input.routeRule.cache, input.botNegotiation === true))
    return { _tag: 'disabled', source: 'route-cache' }

  return { _tag: 'enabled', source: 'default', vary: getContentNegotiationVary(input.botNegotiation) }
}
