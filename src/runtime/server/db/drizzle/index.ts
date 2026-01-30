/**
 * Drizzle ORM database layer for nuxt-ai-ready
 */

// Re-export schema for direct table access (build-time aliased to sqlite or postgres)
export * from '#ai-ready-virtual/db-schema.mjs'

// Client
export { closeDrizzle, useDrizzle } from './client'
export type { DatabaseDialect, DrizzleDatabase } from './client'

// Queries
export {
  // Cron queries
  completeCronRun,
  // Page queries
  countPages,
  // IndexNow queries
  countPagesNeedingIndexNowSync,
  // Info table queries
  deleteInfoValue,
  deletePage,
  getAllPages,
  getContentHashes,
  getInfoValue,
  // Sitemap queries
  getNextSitemapToCrawl,
  getPageByRoute,
  getPageLastmods,
  getPagesNeedingIndexNowSync,
  getPendingPages,
  getRecentCronRuns,
  getSitemapStatus,
  initSchema,
  markIndexNowSynced,
  markPageIndexed,
  markRoutesPending,
  markSitemapCrawled,
  markSitemapError,
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
