import type { H3Event } from 'h3'
import type { DrizzleDatabase } from './client'
import { cronRuns, info, pages, sitemaps } from '#ai-ready-virtual/db-schema.mjs'
import { and, count, desc, eq, gt, isNull, like, lt, or, sql } from 'drizzle-orm'
import { useDrizzle } from './client'

// ============================================================================
// Types
// ============================================================================

export interface PageInput {
  route: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string[]
  contentHash?: string
  updatedAt: string
  isError?: boolean
  source?: 'prerender' | 'runtime'
}

export interface PageOutput {
  route: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string[]
  contentHash?: string
  updatedAt: string
  isError: boolean
}

export interface PageMetaOutput {
  route: string
  title: string
  description: string
  headings: string
  keywords: string[]
  updatedAt: string
  isError: boolean
}

// ============================================================================
// Helpers
// ============================================================================

const RE_LEADING_SLASH = /^\//
const RE_SLASH = /\//g

function normalizeRouteKey(route: string): string {
  return route.replace(RE_LEADING_SLASH, '').replace(RE_SLASH, ':') || 'index'
}

function rowToPage(row: any): PageOutput {
  return {
    route: row.route,
    title: row.title,
    description: row.description,
    markdown: row.markdown,
    headings: row.headings,
    keywords: JSON.parse(row.keywords || '[]'),
    contentHash: row.contentHash || undefined,
    updatedAt: row.updatedAt,
    isError: row.isError === 1,
  }
}

function rowToMeta(row: any): PageMetaOutput {
  return {
    route: row.route,
    title: row.title,
    description: row.description,
    headings: row.headings,
    keywords: JSON.parse(row.keywords || '[]'),
    updatedAt: row.updatedAt,
    isError: row.isError === 1,
  }
}

// ============================================================================
// Page Queries
// ============================================================================

/**
 * Insert or update a page
 */
export async function upsertPage(event: H3Event | undefined, page: PageInput): Promise<void> {
  const client = await useDrizzle(event)
  const now = Date.now()

  const values = {
    route: page.route,
    routeKey: normalizeRouteKey(page.route),
    title: page.title,
    description: page.description,
    markdown: page.markdown,
    headings: page.headings,
    keywords: JSON.stringify(page.keywords),
    contentHash: page.contentHash || null,
    updatedAt: page.updatedAt,
    indexedAt: now,
    isError: page.isError ? 1 : 0,
    indexed: page.isError ? 0 : 1,
    source: page.source || 'prerender',
    lastSeenAt: now,
  }

  await (client.db as any)
    .insert(pages)
    .values(values)
    .onConflictDoUpdate({
      target: pages.route,
      set: {
        routeKey: values.routeKey,
        title: values.title,
        description: values.description,
        markdown: values.markdown,
        headings: values.headings,
        keywords: values.keywords,
        contentHash: values.contentHash,
        updatedAt: values.updatedAt,
        indexedAt: values.indexedAt,
        isError: values.isError,
        indexed: values.indexed,
        source: values.source,
        lastSeenAt: values.lastSeenAt,
      },
    })
}

/**
 * Get all pages
 */
export async function getAllPages(
  event: H3Event | undefined,
  options?: { includeErrors?: boolean, excludeMarkdown?: boolean },
): Promise<PageOutput[] | PageMetaOutput[]> {
  const client = await useDrizzle(event)

  let query = (client.db as any).select().from(pages)

  if (!options?.includeErrors) {
    query = query.where(eq(pages.isError, 0))
  }

  const rows = await query
  return rows.map((row: any) => options?.excludeMarkdown ? rowToMeta(row) : rowToPage(row))
}

/**
 * Get a single page by route
 */
export async function getPageByRoute(
  event: H3Event | undefined,
  route: string,
): Promise<PageOutput | undefined> {
  const client = await useDrizzle(event)

  const rows = await (client.db as any)
    .select()
    .from(pages)
    .where(eq(pages.route, route))
    .limit(1)

  if (!rows.length)
    return undefined

  return rowToPage(rows[0])
}

/**
 * Get lastmod (updatedAt) for all indexed pages
 * Returns a Map for O(1) lookup when enriching sitemaps
 */
export async function getPageLastmods(
  event: H3Event | undefined,
): Promise<Map<string, string>> {
  const client = await useDrizzle(event)

  const rows = await (client.db as any)
    .select({
      route: pages.route,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .where(and(
      eq(pages.isError, 0),
      eq(pages.indexed, 1),
    ))

  const map = new Map<string, string>()
  for (const row of rows) {
    if (row.route && row.updatedAt) {
      map.set(row.route, row.updatedAt)
    }
  }
  return map
}

/**
 * Search pages (uses LIKE for both dialects, FTS5 fallback for SQLite)
 */
export async function searchPages(
  event: H3Event | undefined,
  query: string,
  options?: { limit?: number },
): Promise<PageMetaOutput[]> {
  const client = await useDrizzle(event)
  const limitNum = options?.limit || 20
  const searchTerm = `%${query}%`

  // For SQLite, try FTS5 first via raw SQL
  if (client.dialect === 'sqlite') {
    try {
      const ftsResult = await (client.db as any).all(sql`
        SELECT p.route, p.title, p.description, p.headings, p.keywords, p.updated_at as "updatedAt", p.is_error as "isError"
        FROM ai_ready_pages p
        JOIN ai_ready_pages_fts fts ON p.id = fts.rowid
        WHERE ai_ready_pages_fts MATCH ${query} AND p.is_error = 0
        LIMIT ${limitNum}
      `)

      if (ftsResult?.length) {
        return ftsResult.map(rowToMeta)
      }
    }
    catch {
      // FTS not available, fall through to LIKE
    }
  }

  // LIKE-based search
  const rows = await (client.db as any)
    .select({
      route: pages.route,
      title: pages.title,
      description: pages.description,
      headings: pages.headings,
      keywords: pages.keywords,
      updatedAt: pages.updatedAt,
      isError: pages.isError,
    })
    .from(pages)
    .where(
      and(
        eq(pages.isError, 0),
        or(
          like(pages.title, searchTerm),
          like(pages.description, searchTerm),
          like(pages.markdown, searchTerm),
          like(pages.headings, searchTerm),
        ),
      ),
    )
    .limit(limitNum)

  return rows.map(rowToMeta)
}

/**
 * Count pages
 */
export async function countPages(
  event: H3Event | undefined,
  options?: { indexed?: boolean, errors?: boolean },
): Promise<number> {
  const client = await useDrizzle(event)

  const conditions = []
  if (options?.indexed !== undefined) {
    conditions.push(eq(pages.indexed, options.indexed ? 1 : 0))
  }
  if (options?.errors !== undefined) {
    conditions.push(eq(pages.isError, options.errors ? 1 : 0))
  }

  let query = (client.db as any).select({ count: count() }).from(pages)
  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  const result = await query
  return Number(result[0]?.count || 0)
}

/**
 * Delete a page by route
 */
export async function deletePage(event: H3Event | undefined, route: string): Promise<void> {
  const client = await useDrizzle(event)

  await (client.db as any).delete(pages).where(eq(pages.route, route))
}

/**
 * Get pending pages (not yet indexed)
 */
export async function getPendingPages(
  event: H3Event | undefined,
  limit: number = 10,
): Promise<{ route: string }[]> {
  const client = await useDrizzle(event)

  return (client.db as any)
    .select({ route: pages.route })
    .from(pages)
    .where(eq(pages.indexed, 0))
    .limit(limit)
}

/**
 * Mark page as indexed
 */
export async function markPageIndexed(event: H3Event | undefined, route: string): Promise<void> {
  const client = await useDrizzle(event)

  await (client.db as any)
    .update(pages)
    .set({ indexed: 1, indexedAt: Date.now() })
    .where(eq(pages.route, route))
}

/**
 * Mark multiple routes as pending (needing re-index)
 */
export async function markRoutesPending(event: H3Event | undefined, routes: string[]): Promise<void> {
  if (routes.length === 0)
    return

  const client = await useDrizzle(event)

  await (client.db as any)
    .update(pages)
    .set({ indexed: 0 })
    .where(sql`${pages.route} IN (${sql.join(routes.map(r => sql`${r}`), sql`, `)})`)
}

/**
 * Get content hashes for all pages
 */
export async function getContentHashes(event?: H3Event): Promise<Map<string, string | null>> {
  const client = await useDrizzle(event)

  const rows = await (client.db as any)
    .select({ route: pages.route, contentHash: pages.contentHash })
    .from(pages)

  return new Map(rows.map((r: { route: string, contentHash: string | null }) => [r.route, r.contentHash]))
}

// ============================================================================
// Info Table Queries (key-value metadata store)
// ============================================================================

/**
 * Get a value from the info table
 */
export async function getInfoValue(event: H3Event | undefined, key: string): Promise<string | null> {
  const client = await useDrizzle(event)

  const row = await (client.db as any)
    .select({ value: info.value })
    .from(info)
    .where(eq(info.id, key))
    .limit(1)

  return row[0]?.value || null
}

/**
 * Set a value in the info table
 */
export async function setInfoValue(event: H3Event | undefined, key: string, value: string): Promise<void> {
  const client = await useDrizzle(event)

  await (client.db as any)
    .insert(info)
    .values({ id: key, value })
    .onConflictDoUpdate({
      target: info.id,
      set: { value },
    })
}

/**
 * Delete a value from the info table
 */
export async function deleteInfoValue(event: H3Event | undefined, key: string): Promise<void> {
  const client = await useDrizzle(event)

  await (client.db as any)
    .delete(info)
    .where(eq(info.id, key))
}

// ============================================================================
// Schema Management
// ============================================================================

const SCHEMA_VERSION = 'v2.0.0-drizzle'

/**
 * Initialize database schema
 */
export async function initSchema(event?: H3Event): Promise<void> {
  const client = await useDrizzle(event)

  // Check current version via raw SQL (table might not exist)
  const currentVersion = await getSchemaVersion(client)
  if (currentVersion === SCHEMA_VERSION)
    return

  // Create tables via raw SQL (Drizzle doesn't have push/migrate at runtime without CLI)
  if (client.dialect === 'postgres') {
    await createPostgresTables(client)
  }
  else {
    await createSQLiteTables(client)
  }

  // Update version
  await (client.db as any)
    .insert(info)
    .values({ id: 'schema', version: SCHEMA_VERSION })
    .onConflictDoUpdate({
      target: info.id,
      set: { version: SCHEMA_VERSION },
    })
}

async function getSchemaVersion(client: DrizzleDatabase): Promise<string | null> {
  try {
    const result = await (client.db as any).all(
      sql`SELECT version FROM _ai_ready_info WHERE id = 'schema'`,
    )
    return result?.[0]?.version || null
  }
  catch {
    return null
  }
}

async function createSQLiteTables(client: DrizzleDatabase): Promise<void> {
  const statements = [
    sql`CREATE TABLE IF NOT EXISTS ai_ready_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT UNIQUE NOT NULL,
      route_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      markdown TEXT NOT NULL DEFAULT '',
      headings TEXT NOT NULL DEFAULT '[]',
      keywords TEXT NOT NULL DEFAULT '[]',
      content_hash TEXT,
      updated_at TEXT NOT NULL,
      indexed_at INTEGER NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      indexed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'prerender',
      last_seen_at INTEGER,
      indexnow_synced_at INTEGER
    )`,
    sql`CREATE TABLE IF NOT EXISTS _ai_ready_info (
      id TEXT PRIMARY KEY,
      value TEXT,
      version TEXT,
      checksum TEXT,
      ready INTEGER DEFAULT 0
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_ready_cron_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      duration_ms INTEGER,
      pages_indexed INTEGER DEFAULT 0,
      pages_remaining INTEGER DEFAULT 0,
      indexnow_submitted INTEGER DEFAULT 0,
      indexnow_remaining INTEGER DEFAULT 0,
      errors TEXT DEFAULT '[]',
      status TEXT DEFAULT 'running'
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_ready_indexnow_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_at INTEGER NOT NULL,
      url_count INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_ready_sitemaps (
      name TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      last_crawled_at INTEGER,
      url_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT
    )`,
    // Indexes
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_route ON ai_ready_pages(route)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_is_error ON ai_ready_pages(is_error)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexed ON ai_ready_pages(indexed)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_source ON ai_ready_pages(source)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_last_seen ON ai_ready_pages(last_seen_at)`,
    // FTS5 virtual table
    sql`CREATE VIRTUAL TABLE IF NOT EXISTS ai_ready_pages_fts USING fts5(
      route, title, description, markdown, headings, keywords,
      content=ai_ready_pages, content_rowid=id
    )`,
    // FTS triggers
    sql`CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ai AFTER INSERT ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END`,
    sql`CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ad AFTER DELETE ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
    END`,
    sql`CREATE TRIGGER IF NOT EXISTS ai_ready_pages_au AFTER UPDATE ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
      INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END`,
  ]

  for (const stmt of statements) {
    await (client.db as any).run(stmt)
  }
}

async function createPostgresTables(client: DrizzleDatabase): Promise<void> {
  const statements = [
    sql`CREATE TABLE IF NOT EXISTS ai_ready_pages (
      id SERIAL PRIMARY KEY,
      route TEXT UNIQUE NOT NULL,
      route_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      markdown TEXT NOT NULL DEFAULT '',
      headings TEXT NOT NULL DEFAULT '[]',
      keywords TEXT NOT NULL DEFAULT '[]',
      content_hash TEXT,
      updated_at TEXT NOT NULL,
      indexed_at INTEGER NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      indexed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'prerender',
      last_seen_at INTEGER,
      indexnow_synced_at INTEGER
    )`,
    sql`CREATE TABLE IF NOT EXISTS _ai_ready_info (
      id TEXT PRIMARY KEY,
      value TEXT,
      version TEXT,
      checksum TEXT,
      ready INTEGER DEFAULT 0
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_ready_cron_runs (
      id SERIAL PRIMARY KEY,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      duration_ms INTEGER,
      pages_indexed INTEGER DEFAULT 0,
      pages_remaining INTEGER DEFAULT 0,
      indexnow_submitted INTEGER DEFAULT 0,
      indexnow_remaining INTEGER DEFAULT 0,
      errors TEXT DEFAULT '[]',
      status TEXT DEFAULT 'running'
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_ready_indexnow_log (
      id SERIAL PRIMARY KEY,
      submitted_at INTEGER NOT NULL,
      url_count INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )`,
    sql`CREATE TABLE IF NOT EXISTS ai_ready_sitemaps (
      name TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      last_crawled_at INTEGER,
      url_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT
    )`,
    // Indexes
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_route ON ai_ready_pages(route)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_is_error ON ai_ready_pages(is_error)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexed ON ai_ready_pages(indexed)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_source ON ai_ready_pages(source)`,
    sql`CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_last_seen ON ai_ready_pages(last_seen_at)`,
  ]

  for (const stmt of statements) {
    await (client.db as any).execute(stmt)
  }
}

// ============================================================================
// IndexNow Queries
// ============================================================================

/**
 * Get pages needing IndexNow sync
 */
export async function getPagesNeedingIndexNowSync(
  event: H3Event | undefined,
  limit = 100,
): Promise<{ route: string }[]> {
  const client = await useDrizzle(event)

  return (client.db as any)
    .select({ route: pages.route })
    .from(pages)
    .where(
      and(
        eq(pages.indexed, 1),
        eq(pages.isError, 0),
        or(
          isNull(pages.indexnowSyncedAt),
          lt(pages.indexnowSyncedAt, pages.indexedAt),
        ),
      ),
    )
    .limit(limit)
}

/**
 * Count pages needing IndexNow sync
 */
export async function countPagesNeedingIndexNowSync(
  event: H3Event | undefined,
): Promise<number> {
  const client = await useDrizzle(event)

  const result = await (client.db as any)
    .select({ count: count() })
    .from(pages)
    .where(
      and(
        eq(pages.indexed, 1),
        eq(pages.isError, 0),
        or(
          isNull(pages.indexnowSyncedAt),
          lt(pages.indexnowSyncedAt, pages.indexedAt),
        ),
      ),
    )

  return Number(result[0]?.count || 0)
}

/**
 * Mark pages as synced to IndexNow
 */
export async function markIndexNowSynced(
  event: H3Event | undefined,
  routes: string[],
): Promise<void> {
  if (routes.length === 0)
    return

  const client = await useDrizzle(event)
  const now = Date.now()

  // Drizzle doesn't support IN with array directly, use raw for now
  const placeholders = routes.map(() => '?').join(',')
  await (client.db as any).run(
    sql.raw(`UPDATE ai_ready_pages SET indexnow_synced_at = ? WHERE route IN (${placeholders})`),
    [now, ...routes],
  )
}

// ============================================================================
// Cron Run Queries
// ============================================================================

export interface CronRunOutput {
  id: number
  startedAt: number
  finishedAt: number | null
  durationMs: number | null
  pagesIndexed: number
  pagesRemaining: number
  indexNowSubmitted: number
  indexNowRemaining: number
  errors: string[]
  status: 'running' | 'success' | 'partial' | 'error'
}

function rowToCronRun(row: any): CronRunOutput {
  return {
    id: row.id,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    pagesIndexed: row.pagesIndexed || 0,
    pagesRemaining: row.pagesRemaining || 0,
    indexNowSubmitted: row.indexnowSubmitted || 0,
    indexNowRemaining: row.indexnowRemaining || 0,
    errors: JSON.parse(row.errors || '[]'),
    status: row.status,
  }
}

/**
 * Start a cron run
 */
export async function startCronRun(event: H3Event | undefined): Promise<number | null> {
  const client = await useDrizzle(event)
  const now = Date.now()

  const result = await (client.db as any)
    .insert(cronRuns)
    .values({ startedAt: now, status: 'running' })
    .returning({ id: cronRuns.id })

  return result[0]?.id || null
}

/**
 * Complete a cron run
 */
export async function completeCronRun(
  event: H3Event | undefined,
  runId: number,
  result: {
    pagesIndexed: number
    pagesRemaining: number
    indexNowSubmitted: number
    indexNowRemaining: number
    errors: string[]
  },
): Promise<void> {
  const client = await useDrizzle(event)
  const now = Date.now()

  // Get start time for duration
  const existing = await (client.db as any)
    .select({ startedAt: cronRuns.startedAt })
    .from(cronRuns)
    .where(eq(cronRuns.id, runId))
    .limit(1)

  const durationMs = existing[0] ? now - existing[0].startedAt : null
  const status = result.errors.length > 0
    ? (result.pagesIndexed > 0 ? 'partial' : 'error')
    : 'success'

  await (client.db as any)
    .update(cronRuns)
    .set({
      finishedAt: now,
      durationMs,
      pagesIndexed: result.pagesIndexed,
      pagesRemaining: result.pagesRemaining,
      indexnowSubmitted: result.indexNowSubmitted,
      indexnowRemaining: result.indexNowRemaining,
      errors: JSON.stringify(result.errors),
      status,
    })
    .where(eq(cronRuns.id, runId))
}

/**
 * Get recent cron runs
 */
export async function getRecentCronRuns(
  event: H3Event | undefined,
  limit = 10,
): Promise<CronRunOutput[]> {
  const client = await useDrizzle(event)

  const rows = await (client.db as any)
    .select()
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(limit)

  return rows.map(rowToCronRun)
}

// ============================================================================
// Sitemap Queries
// ============================================================================

export interface SitemapOutput {
  name: string
  route: string
  lastCrawledAt: number | null
  urlCount: number
  errorCount: number
  lastError: string | null
}

function rowToSitemap(row: any): SitemapOutput {
  return {
    name: row.name,
    route: row.route,
    lastCrawledAt: row.lastCrawledAt,
    urlCount: row.urlCount || 0,
    errorCount: row.errorCount || 0,
    lastError: row.lastError,
  }
}

/**
 * Sync sitemaps from config
 */
export async function syncSitemaps(
  event: H3Event | undefined,
  sitemapList: Array<{ name: string, route: string }>,
): Promise<{ added: number, removed: number }> {
  const client = await useDrizzle(event)

  const existing = await (client.db as any)
    .select({ name: sitemaps.name })
    .from(sitemaps)

  const existingNames = new Set(existing.map((r: any) => r.name))
  const configNames = new Set(sitemapList.map(s => s.name))

  let added = 0
  let removed = 0

  // Insert new
  for (const sitemap of sitemapList) {
    if (!existingNames.has(sitemap.name)) {
      await (client.db as any)
        .insert(sitemaps)
        .values({ name: sitemap.name, route: sitemap.route })
      added++
    }
  }

  // Remove stale
  for (const name of existingNames) {
    if (!configNames.has(name as string)) {
      await (client.db as any)
        .delete(sitemaps)
        .where(eq(sitemaps.name, name as string))
      removed++
    }
  }

  return { added, removed }
}

/**
 * Get next sitemap to crawl
 */
export async function getNextSitemapToCrawl(
  event: H3Event | undefined,
  minIntervalMinutes = 5,
): Promise<SitemapOutput | null> {
  const client = await useDrizzle(event)
  const threshold = Date.now() - minIntervalMinutes * 60 * 1000

  // First try error sitemaps
  const errorRow = await (client.db as any)
    .select()
    .from(sitemaps)
    .where(
      and(
        gt(sitemaps.errorCount, 0),
        lt(sitemaps.errorCount, 10),
        or(
          isNull(sitemaps.lastCrawledAt),
          lt(sitemaps.lastCrawledAt, threshold),
        ),
      ),
    )
    .orderBy(sitemaps.lastCrawledAt)
    .limit(1)

  if (errorRow.length)
    return rowToSitemap(errorRow[0])

  // Then oldest crawled
  const row = await (client.db as any)
    .select()
    .from(sitemaps)
    .where(
      and(
        eq(sitemaps.errorCount, 0),
        or(
          isNull(sitemaps.lastCrawledAt),
          lt(sitemaps.lastCrawledAt, threshold),
        ),
      ),
    )
    .orderBy(sitemaps.lastCrawledAt)
    .limit(1)

  return row.length ? rowToSitemap(row[0]) : null
}

/**
 * Mark sitemap as crawled
 */
export async function markSitemapCrawled(
  event: H3Event | undefined,
  name: string,
  urlCount: number,
): Promise<void> {
  const client = await useDrizzle(event)

  await (client.db as any)
    .update(sitemaps)
    .set({
      lastCrawledAt: Date.now(),
      urlCount,
      errorCount: 0,
      lastError: null,
    })
    .where(eq(sitemaps.name, name))
}

/**
 * Mark sitemap error
 */
export async function markSitemapError(
  event: H3Event | undefined,
  name: string,
  error: string,
): Promise<void> {
  const client = await useDrizzle(event)

  await (client.db as any)
    .update(sitemaps)
    .set({
      lastCrawledAt: Date.now(),
      errorCount: sql`${sitemaps.errorCount} + 1`,
      lastError: error,
    })
    .where(eq(sitemaps.name, name))
}

/**
 * Get all sitemaps status
 */
export async function getSitemapStatus(
  event: H3Event | undefined,
): Promise<SitemapOutput[]> {
  const client = await useDrizzle(event)

  const rows = await (client.db as any)
    .select()
    .from(sitemaps)
    .orderBy(sitemaps.name)

  return rows.map(rowToSitemap)
}

/**
 * Reset all sitemap errors (called on build_id change)
 */
export async function resetSitemapErrors(event: H3Event | undefined): Promise<number> {
  const client = await useDrizzle(event)

  // Count sitemaps with errors
  const countResult = await (client.db as any)
    .select({ count: count() })
    .from(sitemaps)
    .where(gt(sitemaps.errorCount, 0))

  const errorCount = countResult[0]?.count || 0

  if (errorCount > 0) {
    await (client.db as any)
      .update(sitemaps)
      .set({
        errorCount: 0,
        lastError: null,
        lastCrawledAt: null,
      })
  }

  return errorCount
}

// ============================================================================
// Seed Routes (for sitemap seeding)
// ============================================================================

/**
 * Seed routes from sitemap
 */
export async function seedRoutes(
  event: H3Event | undefined,
  routes: string[],
): Promise<number> {
  if (routes.length === 0)
    return 0

  const client = await useDrizzle(event)
  const now = new Date().toISOString()
  const nowMs = Date.now()

  for (const route of routes) {
    const values = {
      route,
      routeKey: normalizeRouteKey(route),
      title: '',
      description: '',
      markdown: '',
      headings: '[]',
      keywords: '[]',
      updatedAt: now,
      indexedAt: 0,
      isError: 0,
      indexed: 0,
      source: 'runtime',
      lastSeenAt: nowMs,
    }

    await (client.db as any)
      .insert(pages)
      .values(values)
      .onConflictDoUpdate({
        target: pages.route,
        set: { lastSeenAt: nowMs },
      })
  }

  return routes.length
}
