import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { getSitemapSeededAt, pruneStaleRoutes, seedRoutes, setSitemapSeededAt } from '../db/queries'
import { logger } from '../logger'
import { fetchSitemapUrls } from '../utils/sitemap'

let seeding: Promise<void> | null = null

export default defineNitroPlugin((nitro) => {
  // Skip during prerender - handled by prerender.ts
  if (import.meta.prerender)
    return

  nitro.hooks.hook('request', async (event) => {
    // Only seed once per process (singleton promise)
    if (!seeding) {
      seeding = seedFromSitemap(event).catch((err) => {
        logger.error('[sitemap-seeder] Failed to seed:', err)
      })
    }
    // Don't await - let it run in background
  })
})

async function seedFromSitemap(event: H3Event): Promise<void> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const { ttl, pruneTtl } = config.runtimeSync

  // Check if sitemap was recently seeded
  const seededAt = await getSitemapSeededAt(event)
  if (seededAt && ttl > 0) {
    const age = (Date.now() - seededAt) / 1000
    if (age < ttl) {
      logger.debug(`[sitemap-seeder] Sitemap fresh (${Math.round(age)}s old), skipping`)
      return
    }
  }

  // Fetch sitemap
  const urls = await fetchSitemapUrls(event)
  if (urls.length === 0) {
    // Warning already logged by fetchSitemapUrls
    return
  }

  // Extract routes from URLs
  const routes = urls.map((u) => {
    const url = new URL(u.loc)
    return url.pathname
  }).filter(route => !route.includes('.')) // Skip file extensions

  // Seed routes into database (updates last_seen_at for existing routes)
  await seedRoutes(event, routes)
  await setSitemapSeededAt(event, Date.now())

  logger.info(`[sitemap-seeder] Seeded ${routes.length} routes from sitemap`)

  // Prune stale routes if configured
  if (pruneTtl > 0) {
    const pruned = await pruneStaleRoutes(event, pruneTtl)
    if (pruned > 0)
      logger.info(`[sitemap-seeder] Pruned ${pruned} stale routes`)
  }
}
