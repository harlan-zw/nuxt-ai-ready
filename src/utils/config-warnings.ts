import type { NegotiationRouteRule } from '../runtime/server/utils/content-negotiation'
import type { ContentNegotiationPolicy } from '../runtime/types'
import { createNitroRouteRuleMatcher } from 'nuxtseo-shared/server'
import { hasMarkdownTwin } from '../runtime/markdown-path'
import { resolveContentNegotiation } from '../runtime/server/utils/content-negotiation'

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
    warnings.push('Set site.url to the public production URL. Discovery catalogs and canonical Markdown links need a public origin.')
  }
  if (input.policy === 'disabled') {
    warnings.push('contentNegotiation: false disables Accept and bot negotiation. Explicit .md URLs remain available; verify discovery links on your deployment.')
  }
  else if (input.static) {
    warnings.push('Static output cannot run Markdown negotiation middleware. Configure negotiation at your host, or use the generated .md URLs.')
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
      warnings.push(`"${route}": contentNegotiation: true overrides cache protection. Verify cache variation for Accept, Sec-Fetch-Dest, and User-Agent before enabling it.`)
    }
    else if (automatic.source === 'isr') {
      warnings.push(`"${route}": ISR disables automatic Markdown negotiation. Use explicit .md URLs, or remove ISR on public pages that need negotiation.`)
    }
    else {
      warnings.push(`"${route}": response caching disables automatic Markdown negotiation. Add Accept, Sec-Fetch-Dest, and User-Agent to cache.varies, or use explicit .md URLs.`)
    }
  }
  return warnings
}
