import type { H3Event } from '#nuxtseo/h3'
import type { useNitroApp } from '#nuxtseo/nitro'
import type { SitemapRouteSource } from '../utils/sitemap-routes'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { trackDrizzleWork } from '../db/drizzle/client'
import { getPageLastmods, getSitemapLastCrawledAt, markSitemapSeeded, seedRoutes } from '../db/queries'
import { logger } from '../logger'
import { mapSitemapRoutes } from '../utils/sitemap-routes'

type NitroApp = ReturnType<typeof useNitroApp>

interface ResolvedSitemapUrl extends SitemapRouteSource {
  lastmod?: string | Date
}

interface SitemapResolvedCtx {
  urls: ResolvedSitemapUrl[]
  sitemapName: string
  event: H3Event
}

interface SitemapOutputCtx {
  sitemap: string
  sitemapName: string
  event: H3Event
}

// Per-request diagnostics, stashed on event.context (the only attach point
// shared between sitemap:resolved and sitemap:output). @nuxtjs/sitemap has no
// diagnostics field of its own to surface, so we render these into the sitemap
// XML ourselves via the output hook.
const DIAGNOSTICS_KEY = '_aiReadySitemapDiagnostics'

function isDebug(event: H3Event): boolean {
  return !!(useRuntimeConfig(event) as { 'nuxt-ai-ready'?: { debug?: boolean } })['nuxt-ai-ready']?.debug
}

function recordDiagnostic(event: H3Event, message: string): void {
  const ctx = event.context as Record<string, unknown>
  const list = (ctx[DIAGNOSTICS_KEY] ??= []) as string[]
  list.push(message)
}

// Re-seed a given sitemap at most once per interval. The hook fires on every
// sitemap request; without this throttle we issued a DB write per route on
// every hit, which timed out large sitemaps on D1.
const SEED_INTERVAL_MS = 5 * 60 * 1000

// In-process throttle timestamps. The durable value can be unavailable when
// the DB read times out, so this keeps the throttle engaged against the same
// process even while reads fail; Math.max with the durable value below makes
// it a guard, never a bypass.
const lastSeedAt = new Map<string, number>()

// Hard cap on DB work that runs before the sitemap renders. The DB driver has
// no cancellation, so a slow/hung D1 read would otherwise stall the response.
// On timeout we fall back and still render the sitemap (without that round's
// enrichment/seeding) rather than hanging.
const READ_TIMEOUT_MS = 3000

// Soft latency threshold. DB work below the hard timeout but above this is the
// early-warning signal that the database is degrading, before it becomes a
// response-blocking outage.
const SLOW_READ_WARN_MS = 1000

// A deferred seed taking this long signals write-path degradation (and risks
// exceeding the platform's background-work budget, e.g. Cloudflare waitUntil).
const SLOW_SEED_WARN_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string, fallback: T, onIssue?: (message: string) => void): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      const message = `${label} timed out after ${ms}ms`
      logger.warn(`[sitemap-seeder] ${message}`)
      onIssue?.(message)
      resolve(fallback)
    }, ms)
    const done = (value: T) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    promise.then(done, (e) => {
      const message = `${label} failed: ${e?.message}`
      logger.warn(`[sitemap-seeder] ${message}`)
      onIssue?.(message)
      done(fallback)
    })
  })
}

// XML comments cannot contain "--"; neutralise it so injected diagnostics keep
// the sitemap well-formed.
function toXmlComment(messages: string[]): string {
  const body = messages.map(m => `  - ${m.replace(/-{2,}/g, '- ')}`).join('\n')
  return `<!-- nuxt-ai-ready sitemap-seeder diagnostics:\n${body}\n-->\n`
}

// Insert in the prolog, after the XML declaration and any processing
// instructions (e.g. the xsl stylesheet) but before the root element.
function injectComment(xml: string, comment: string): string {
  const prolog = xml.match(/^\s*(?:<\?[^>]*\?>\s*)*/)
  const idx = prolog ? prolog[0].length : 0
  return xml.slice(0, idx) + comment + xml.slice(idx)
}

export default function sitemapSeederPlugin(nitroApp: NitroApp) {
  // Hook into @nuxtjs/sitemap's resolved hook
  // This fires when a sitemap is rendered, giving us the URLs directly
  nitroApp.hooks.hook('sitemap:resolved', async (ctx: SitemapResolvedCtx) => {
    // Skip in dev - DB not available
    if (import.meta.dev)
      return

    const { urls, sitemapName, event } = ctx
    if (urls.length === 0)
      return

    const routeToUrl = mapSitemapRoutes(urls)
    if (routeToUrl.size === 0)
      return

    logger.debug(`[sitemap-seeder] Processing ${routeToUrl.size} routes from ${sitemapName}`)

    // Surface diagnostics into the served sitemap XML only under debug, so
    // normal sitemaps stay clean. The output hook below renders whatever we record.
    const record = isDebug(event) ? (m: string) => recordDiagnostic(event, m) : undefined

    // Enrich sitemap entries with lastmod from our indexed pages. This mutates
    // the rendered output, so it must complete before the hook returns. Single
    // SELECT, cheap.
    const readStart = Date.now()
    const lastmods = await withTimeout(getPageLastmods(event), READ_TIMEOUT_MS, 'getPageLastmods', new Map<string, string>(), record)

    let enriched = 0
    for (const [route, url] of routeToUrl) {
      const lastmod = lastmods.get(route)
      if (lastmod && !url.lastmod) {
        url.lastmod = lastmod
        enriched++
      }
    }

    if (enriched > 0) {
      logger.debug(`[sitemap-seeder] Enriched ${enriched} URLs with lastmod`)
    }

    // Throttle re-seeding: skip if this sitemap was seeded recently. Seeding
    // writes don't affect the rendered output, so this never delays the response.
    const lastCrawled = await withTimeout(getSitemapLastCrawledAt(event, sitemapName), READ_TIMEOUT_MS, 'getSitemapLastCrawledAt', null, record)

    // On-path DB latency is what stalls the sitemap response; warn before it
    // crosses the hard timeout so a degrading DB is visible early.
    const readMs = Date.now() - readStart
    if (readMs >= SLOW_READ_WARN_MS) {
      const message = `slow DB reads: ${readMs}ms (timeout ${READ_TIMEOUT_MS}ms)`
      logger.warn(`[sitemap-seeder] ${message} for ${sitemapName}`)
      record?.(message)
    }

    const lastSeed = Math.max(lastCrawled ?? 0, lastSeedAt.get(sitemapName) ?? 0)
    if (Date.now() - lastSeed < SEED_INTERVAL_MS)
      return
    lastSeedAt.set(sitemapName, Date.now())

    const routes = [...routeToUrl.keys()]
    const urlCount = urls.length

    // Defer the writes off the response path. On Cloudflare, waitUntil keeps the
    // worker alive until they finish without blocking the sitemap response.
    const seed = async () => {
      const seedStart = Date.now()
      const seeded = await seedRoutes(event, routes).catch((e) => {
        logger.warn(`[sitemap-seeder] Failed to seed routes: ${e.message}`)
        return 0
      })
      await markSitemapSeeded(event, sitemapName, urlCount, lastCrawled).catch((e) => {
        logger.warn(`[sitemap-seeder] Failed to mark sitemap: ${e.message}`)
      })
      const seedMs = Date.now() - seedStart
      if (seedMs >= SLOW_SEED_WARN_MS)
        logger.warn(`[sitemap-seeder] Slow seed: ${seedMs}ms for ${seeded} routes in ${sitemapName}`)
      else if (seeded > 0)
        logger.debug(`[sitemap-seeder] Seeded ${seeded} routes from ${sitemapName} in ${seedMs}ms`)
    }

    if (event.waitUntil) {
      const backgroundSeed = trackDrizzleWork(event, seed()).catch(err =>
        logger.error(`[sitemap-seeder] Background seed failed: ${err.message}`),
      )
      event.waitUntil(backgroundSeed)
    }
    else {
      await seed()
    }
  })

  // Render any diagnostics recorded during sitemap:resolved into the served
  // sitemap XML, so they can be inspected with a plain request to the sitemap
  // when nuxt-ai-ready debug is enabled.
  nitroApp.hooks.hook('sitemap:output', (ctx: SitemapOutputCtx) => {
    const diagnostics = (ctx.event.context as Record<string, unknown>)[DIAGNOSTICS_KEY] as string[] | undefined
    if (!diagnostics?.length)
      return
    ctx.sitemap = injectComment(ctx.sitemap, toXmlComment(diagnostics))
  })
}
