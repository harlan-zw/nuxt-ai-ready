import type { NegotiationRouteRule } from '../runtime/server/utils/content-negotiation'
import type { ContentNegotiationPolicy } from '../runtime/types'
import { createNitroRouteRuleMatcher } from 'nuxtseo-shared/server'
import { hasMarkdownTwin } from '../runtime/markdown-path'
import { resolveContentNegotiation } from '../runtime/server/utils/content-negotiation'

const CACHE_GUIDE = 'https://nuxtseo.com/docs/ai-ready/guides/markdown#cache-safety'
const CACHE_FIX = [
  'Add to this route rule: cache: { varies: [\'accept\', \'sec-fetch-dest\', \'user-agent\'] }',
  'Keep existing cache options and varies entries.',
  'HTTP Vary alone does not change Nitro\'s cache key.',
  'If a CDN ignores Vary, set aiReady: { contentNegotiation: false } and use explicit .md URLs.',
].join('\n  ')

export interface ConfigurationWarningInput {
  policy: ContentNegotiationPolicy
  static: boolean
  siteUrl: string | undefined
  routeRules: Record<string, NegotiationRouteRule & { redirect?: unknown, proxy?: unknown }>
}

/** Report configuration limits using the same cache policy as runtime negotiation. */
export function resolveConfigurationWarnings(input: ConfigurationWarningInput): string[] {
  const warnings: string[] = []
  const hostname = input.siteUrl && URL.canParse(input.siteUrl) ? new URL(input.siteUrl).hostname : ''
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]') {
    warnings.push('Set site.url to the public production URL. Discovery catalogs and canonical Markdown links need a public origin.\n  In nuxt.config.ts, set site: { url: "https://your-domain.com" }. Replace the example with your production origin.')
  }
  if (input.policy === 'disabled') {
    warnings.push(`contentNegotiation: false disables Accept and bot negotiation.\n  To restore automatic negotiation, set aiReady: { contentNegotiation: 'auto' } in nuxt.config.ts.\n  If disabled intentionally, link explicit .md URLs and verify they resolve after deployment.\n  Guide: ${CACHE_GUIDE}`)
  }
  else if (input.static) {
    warnings.push(`Static output cannot run Markdown negotiation middleware.\n  Link the generated .md URLs, or use a server deployment for automatic negotiation.\n  For edge negotiation, preserve all three inputs: Accept, Sec-Fetch-Dest, and User-Agent.\n  Guide: ${CACHE_GUIDE}`)
  }

  const match = createNitroRouteRuleMatcher<ConfigurationWarningInput['routeRules'][string]>({ nitro: { routeRules: input.routeRules } })
  for (const route of Object.keys(input.routeRules).sort()) {
    if (!hasMarkdownTwin(route) || route.startsWith('/.well-known/'))
      continue
    const rule = match(route)
    if (rule.redirect || rule.proxy)
      continue
    if (input.static || input.policy === 'disabled')
      continue
    const automatic = resolveContentNegotiation({ policy: 'auto', routeRule: rule })
    if (automatic._tag === 'enabled')
      continue
    if (input.policy === 'enabled') {
      const fix = automatic.source === 'isr'
        ? `ISR cannot use automatic negotiation. Set isr: false on this route, or use explicit .md URLs.${rule.cache ? `\n  ${CACHE_FIX}` : ''}`
        : CACHE_FIX
      warnings.push(`"${route}": contentNegotiation: true overrides cache protection.\n  In nuxt.config.ts, set aiReady: { contentNegotiation: 'auto' } to restore cache protection.\n  ${fix}\n  Guide: ${CACHE_GUIDE}`)
    }
    else if (automatic.source === 'isr') {
      warnings.push(`"${route}": ISR disables automatic Markdown negotiation.\n  To keep ISR, use explicit .md URLs.\n  To use negotiation, set isr: false on this route in nuxt.config.ts.${rule.cache ? `\n  ${CACHE_FIX}` : ''}\n  Guide: ${CACHE_GUIDE}`)
    }
    else {
      warnings.push(`"${route}": response caching disables automatic Markdown negotiation.\n  In nuxt.config.ts:\n  ${CACHE_FIX}\n  Guide: ${CACHE_GUIDE}`)
    }
  }
  return warnings
}
