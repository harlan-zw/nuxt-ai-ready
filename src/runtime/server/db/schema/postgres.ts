import { bigint, index, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

// Main pages table
export const pages = pgTable('ai_ready_pages', {
  id: serial('id').primaryKey(),
  route: text('route').unique().notNull(),
  routeKey: text('route_key').unique().notNull(),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  markdown: text('markdown').notNull().default(''),
  headings: text('headings').notNull().default('[]'),
  keywords: text('keywords').notNull().default('[]'),
  contentHash: text('content_hash'),
  updatedAt: text('updated_at').notNull(),
  indexedAt: bigint('indexed_at', { mode: 'number' }).notNull(),
  isError: integer('is_error').notNull().default(0),
  indexed: integer('indexed').notNull().default(0),
  source: text('source').notNull().default('prerender'),
  lastSeenAt: bigint('last_seen_at', { mode: 'number' }),
  locale: text('locale').notNull().default(''),
}, table => [
  index('idx_ai_ready_pages_route').on(table.route),
  index('idx_ai_ready_pages_is_error').on(table.isError),
  index('idx_ai_ready_pages_indexed').on(table.indexed),
  index('idx_ai_ready_pages_source').on(table.source),
  index('idx_ai_ready_pages_last_seen').on(table.lastSeenAt),
  index('idx_ai_ready_pages_locale').on(table.locale),
])

// Schema version tracking
export const info = pgTable('_ai_ready_info', {
  id: text('id').primaryKey(),
  value: text('value'),
  version: text('version'),
  checksum: text('checksum'),
  ready: integer('ready').default(0),
})

// Cron run history
export const cronRuns = pgTable('ai_ready_cron_runs', {
  id: serial('id').primaryKey(),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  finishedAt: bigint('finished_at', { mode: 'number' }),
  durationMs: integer('duration_ms'),
  pagesIndexed: integer('pages_indexed').default(0),
  pagesRemaining: integer('pages_remaining').default(0),
  errors: text('errors').default('[]'),
  status: text('status').default('running'),
}, table => [
  index('idx_ai_ready_cron_runs_started').on(table.startedAt),
])

// Sitemap tracking
export const sitemaps = pgTable('ai_ready_sitemaps', {
  name: text('name').primaryKey(),
  route: text('route').notNull(),
  lastCrawledAt: bigint('last_crawled_at', { mode: 'number' }),
  urlCount: integer('url_count').default(0),
  errorCount: integer('error_count').default(0),
  lastError: text('last_error'),
  crawlState: text('crawl_state'),
}, table => [
  index('idx_ai_ready_sitemaps_crawled').on(table.lastCrawledAt),
])

// Export schema for migrations
export const schema = { pages, info, cronRuns, sitemaps }
