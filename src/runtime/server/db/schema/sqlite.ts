import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Main pages table
export const pages = sqliteTable('ai_ready_pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  route: text('route').unique().notNull(),
  routeKey: text('route_key').unique().notNull(),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  markdown: text('markdown').notNull().default(''),
  headings: text('headings').notNull().default('[]'),
  keywords: text('keywords').notNull().default('[]'),
  contentHash: text('content_hash'),
  updatedAt: text('updated_at').notNull(),
  indexedAt: integer('indexed_at').notNull(),
  isError: integer('is_error').notNull().default(0),
  indexed: integer('indexed').notNull().default(0),
  source: text('source').notNull().default('prerender'),
  lastSeenAt: integer('last_seen_at'),
  indexnowSyncedAt: integer('indexnow_synced_at'),
}, table => [
  index('idx_ai_ready_pages_route').on(table.route),
  index('idx_ai_ready_pages_is_error').on(table.isError),
  index('idx_ai_ready_pages_indexed').on(table.indexed),
  index('idx_ai_ready_pages_source').on(table.source),
  index('idx_ai_ready_pages_last_seen').on(table.lastSeenAt),
])

// Schema version tracking
export const info = sqliteTable('_ai_ready_info', {
  id: text('id').primaryKey(),
  value: text('value'),
  version: text('version'),
  checksum: text('checksum'),
  ready: integer('ready').default(0),
})

// Cron run history
export const cronRuns = sqliteTable('ai_ready_cron_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  durationMs: integer('duration_ms'),
  pagesIndexed: integer('pages_indexed').default(0),
  pagesRemaining: integer('pages_remaining').default(0),
  indexnowSubmitted: integer('indexnow_submitted').default(0),
  indexnowRemaining: integer('indexnow_remaining').default(0),
  errors: text('errors').default('[]'),
  status: text('status').default('running'),
}, table => [
  index('idx_ai_ready_cron_runs_started').on(table.startedAt),
])

// IndexNow submission log
export const indexnowLog = sqliteTable('ai_ready_indexnow_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  submittedAt: integer('submitted_at').notNull(),
  urlCount: integer('url_count').notNull(),
  success: integer('success').notNull().default(0),
  error: text('error'),
}, table => [
  index('idx_ai_ready_indexnow_log_submitted').on(table.submittedAt),
])

// Sitemap tracking
export const sitemaps = sqliteTable('ai_ready_sitemaps', {
  name: text('name').primaryKey(),
  route: text('route').notNull(),
  lastCrawledAt: integer('last_crawled_at'),
  urlCount: integer('url_count').default(0),
  errorCount: integer('error_count').default(0),
  lastError: text('last_error'),
}, table => [
  index('idx_ai_ready_sitemaps_crawled').on(table.lastCrawledAt),
])

// Export schema for migrations
export const schema = { pages, info, cronRuns, indexnowLog, sitemaps }
