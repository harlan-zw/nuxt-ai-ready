import type { H3Event } from '#nuxtseo/h3'
import type { RuntimeI18nConfig } from '../utils/i18n'
import { getRequestHost } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { createUniversalContext } from '../utils/context'
import { resolveI18nDomain, resolveLocaleFromRoute } from '../utils/i18n'

function hostFromUrl(url: string | undefined): string | undefined {
  if (!url)
    return undefined
  try {
    return new URL(url).host || undefined
  }
  catch {
    return undefined
  }
}

/**
 * Resolve a route's locale, deferring to the explicit value when supplied.
 * Falls back to the runtime i18n config (set when @nuxtjs/i18n is detected at
 * build time). Returns '' when no i18n is configured, matching the schema's
 * default for non-i18n sites.
 *
 * The host comes from the page's own URL, in order of trust:
 * 1. the sitemap entry URL, when the caller has one
 * 2. the request host, but only when it is itself a configured locale domain:
 *    cron and poll requests can arrive on any domain (e.g. a workers.dev
 *    preview host), which would otherwise decide the locale of every indexed
 *    page on multi-domain i18n sites
 * 3. the site config host
 */
export function deriveLocale(event: H3Event | undefined, route: string, explicit?: string, pageUrl?: string): string {
  if (explicit !== undefined)
    return explicit
  const cfg = useRuntimeConfig(event) as { 'nuxt-ai-ready'?: { i18n?: RuntimeI18nConfig | null } }
  const i18n = cfg['nuxt-ai-ready']?.i18n
  if (!i18n)
    return ''

  const entryHost = hostFromUrl(pageUrl)
  if (entryHost)
    return resolveLocaleFromRoute(route, i18n, { host: entryHost }).locale

  let requestHost: string | undefined
  if (event) {
    try {
      requestHost = getRequestHost(event, { xForwardedHost: true })
    }
    catch {
      // An event without a readable request carries no host signal; fall
      // through to the site config host.
      requestHost = undefined
    }
  }
  const host = requestHost && resolveI18nDomain(requestHost, i18n)._tag === 'known'
    ? requestHost
    : hostFromUrl(createUniversalContext(event).siteUrl)
  return resolveLocaleFromRoute(route, i18n, host ? { host } : undefined).locale
}

/** Longest time `seedRoutes` lets `last_seen_at` lag behind a sighting. */
export const SEED_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Resolve how long an unchanged seeded row may skip its `last_seen_at` write.
 * With pruning on, the window stays at half of pruneTtl so the lag stays small
 * against the TTL. Pass the same value to `pruneStaleRoutes`.
 */
export function resolveSeedRefreshWindowMs(pruneTtlSeconds: number): number {
  if (!(pruneTtlSeconds > 0))
    return SEED_REFRESH_WINDOW_MS
  return Math.min(SEED_REFRESH_WINDOW_MS, Math.floor(pruneTtlSeconds * 1000 / 2))
}

export interface SeedRoutesOptions {
  /**
   * An existing row is rewritten only when its `last_seen_at` is older than
   * this, when it is an error row, or when its locale changed.
   * @default SEED_REFRESH_WINDOW_MS
   */
  refreshWindowMs?: number
}
