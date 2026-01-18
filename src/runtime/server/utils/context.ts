import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { createSiteConfigStack } from 'site-config-stack'

export interface UniversalContext {
  /** Site URL from nuxt-site-config */
  siteUrl: string | undefined
  /** Whether we're in a request context vs scheduled task */
  hasEvent: boolean
}

/**
 * Create context that works in both request and scheduled task contexts
 * In request context: uses H3Event and nuxt-site-config middleware
 * In scheduled task: rebuilds from build-time site-config stack
 */
export function createUniversalContext(event: H3Event | undefined): UniversalContext {
  const runtimeConfig = useRuntimeConfig(event)

  // Try request-time site config first (set by nuxt-site-config middleware)
  let siteUrl = (runtimeConfig.site as { url?: string } | undefined)?.url
    || (runtimeConfig.public?.site as { url?: string } | undefined)?.url

  // Fallback: rebuild from nuxt-site-config's build-time stack
  // Works in scheduled tasks where middleware hasn't run
  if (!siteUrl) {
    const siteConfigRuntime = runtimeConfig['nuxt-site-config'] as { stack?: Array<{ url?: string }> } | undefined
    if (siteConfigRuntime?.stack) {
      const stack = createSiteConfigStack()
      siteConfigRuntime.stack.forEach(c => stack.push(c))
      siteUrl = stack.get().url
    }
  }

  return {
    siteUrl,
    hasEvent: !!event,
  }
}

/**
 * Get site URL from context, throwing if not configured
 */
export function requireSiteUrl(event: H3Event | undefined): string {
  const ctx = createUniversalContext(event)
  if (!ctx.siteUrl) {
    throw new Error('Site URL not configured. Set site.url in nuxt.config.')
  }
  return ctx.siteUrl
}
