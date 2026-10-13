import type { RuntimeI18nConfig } from '../utils/i18n'
import type { AiReadyDatabaseEvent } from './context'
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
export function deriveLocale(event: AiReadyDatabaseEvent | undefined, route: string, explicit?: string, pageUrl?: string): string {
  if (explicit !== undefined)
    return explicit
  const cfg = useRuntimeConfig() as { 'nuxt-ai-ready'?: { i18n?: RuntimeI18nConfig | null } }
  const i18n = cfg['nuxt-ai-ready']?.i18n
  if (!i18n)
    return ''

  const entryHost = hostFromUrl(pageUrl)
  if (entryHost)
    return resolveLocaleFromRoute(route, i18n, { host: entryHost }).locale

  let requestHost: string | undefined
  if (event) {
    try {
      const headers = event.req?.headers || event.node?.req.headers
      const host = headers instanceof Headers
        ? headers.get('x-forwarded-host') || headers.get('host')
        : headers?.['x-forwarded-host'] || headers?.host
      requestHost = (Array.isArray(host) ? host[0] : host)?.split(',')[0]?.trim()
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
   * An existing row is rewritten when its `last_seen_at` is older than this
   * or its locale changed. Error rows retry after this interval.
   * @default SEED_REFRESH_WINDOW_MS
   */
  refreshWindowMs?: number
}

export type SeedRoute = string | { route: string, locale?: string, url?: string, lastmod?: string | Date }

/** Parse source dates once, so equivalent W3C date representations compare equal. */
export function parseSourceLastmod(input: string | Date | undefined): string | null {
  if (input === undefined)
    return null
  if (typeof input === 'string' && (input.length > 64 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(input)))
    return null
  const date = new Date(input)
  if (!Number.isFinite(date.getTime()))
    return null
  // Date silently rolls invalid calendar dates into the next month.
  if (typeof input === 'string') {
    const calendarDate = input.slice(0, 10)
    const parsedCalendarDate = new Date(calendarDate)
    if (!Number.isFinite(parsedCalendarDate.getTime()) || parsedCalendarDate.toISOString().slice(0, 10) !== calendarDate)
      return null
  }
  return date.toISOString()
}
