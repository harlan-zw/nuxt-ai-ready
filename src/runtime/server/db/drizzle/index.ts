/**
 * Drizzle ORM database layer for nuxt-ai-ready
 */

// Re-export schema for direct table access (build-time aliased to sqlite or postgres)
export * from '#ai-ready-virtual/db-schema.mjs'

// Client
export { closeDrizzle, finishDrizzleResponse, trackDrizzleWork, useDrizzle } from './client'
export type { DatabaseDialect, DrizzleDatabase } from './client'

// Queries
export {
  // Cron queries
  completeCronRun,
  // Page queries
  countPages,
  // Info table queries
  deleteInfoValue,
  getAllPages,
  getContentHashes,
  getInfoValue,
  // Sitemap queries
  getNextSitemapToCrawl,
  getPageByRoute,
  getPageLastmods,
  getPendingPages,
  getRecentCronRuns,
  getSitemapStatus,
  initSchema,
  markPageIndexed,
  markRoutesPending,
  markSitemapCrawled,
  markSitemapCrawlPartial,
  markSitemapError,
  markSitemapSeeded,
  resetSitemapErrors,
  searchPages,
  seedRoutes,
  setInfoValue,
  startCronRun,
  syncSitemaps,
  upsertPage,
} from './queries'
export type {
  CronRunOutput,
  PageInput,
  PageMetaOutput,
  PageOutput,
  SitemapOutput,
} from './queries'

// Raw SQL access
export { useRawDb } from './raw'

export type { RawExecutor } from './raw'
