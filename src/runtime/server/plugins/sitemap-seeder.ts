import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { getSitemapSeededAt, seedRoutes, setSitemapSeededAt } from '../db/queries'
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
  const sitemapTtl = config.sitemapTtl ?? 3600 // Default 1 hour

  const db = await useDatabase()

  // Check if sitemap was recently seeded
  const seededAt = await getSitemapSeededAt(db)
  if (seededAt && sitemapTtl > 0) {
    const age = (Date.now() - seededAt) / 1000
    if (age < sitemapTtl) {
      logger.debug(`[sitemap-seeder] Sitemap fresh (${Math.round(age)}s old), skipping`)
      return
    }
  }

  // Fetch sitemap
  const urls = await fetchSitemapUrls(event)
  if (urls.length === 0) {
    logger.debug('[sitemap-seeder] No URLs in sitemap')
    return
  }

  // Extract routes from URLs
  const routes = urls.map((u) => {
    const url = new URL(u.loc)
    return url.pathname
  }).filter(route => !route.includes('.')) // Skip file extensions

  // Seed routes into database
  await seedRoutes(db, routes)
  await setSitemapSeededAt(db, Date.now())

  logger.info(`[sitemap-seeder] Seeded ${routes.length} routes from sitemap`)
}
