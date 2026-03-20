import type { H3Event } from 'h3'
import type { RawExecutor } from './drizzle/raw'
import { useEvent } from 'nitropack/runtime'
import { initSchema } from './drizzle/queries'
import { useRawDb } from './drizzle/raw'
import { normalizeRouteKey } from './shared'

/** Try to get the current H3Event from context or use provided event */
function getEventFromContext(providedEvent?: H3Event): H3Event | undefined {
  if (providedEvent)
    return providedEvent
  try {
    return useEvent()
  }
  catch {
    return undefined
  }
}

let devWarningShown = false
let schemaInitialized = false

const RE_FTS_CHARS = /[*:^"()]/g
const RE_WHITESPACE = /\s+/

/** Get database, with dev mode warning and prerender handling */
async function getDb(event?: H3Event): Promise<RawExecutor | null> {
  if (import.meta.dev) {
    if (!devWarningShown) {
      console.warn('[nuxt-ai-ready] Page data unavailable in dev. Run `nuxi generate` for full metadata.')
      devWarningShown = true
    }
    return null
  }

  // During prerender, read from build-time SQLite via virtual module
  if (import.meta.prerender) {
    return getPrerenderDb()
  }

  // Runtime: use raw database executor
  const resolvedEvent = getEventFromContext(event)
  const db = await useRawDb(resolvedEvent)

  // Initialize schema on first connection
  if (!schemaInitialized) {
    await initSchema(resolvedEvent)
    schemaInitialized = true
  }

  return db
}

/** Get prerender database adapter (reads from build-time SQLite) */
async function getPrerenderDb(): Promise<RawExecutor> {
  const m = await import('#ai-ready-virtual/read-page-data.mjs')
  const data = await (m as unknown as {
    readPageDataFromFilesystem: () => Promise<{ pages: PageData[], errorRoutes: string[] }>
  }).readPageDataFromFilesystem()

  // Create a minimal adapter that returns the cached data
  const pages = data.pages || []
  const errorRoutes = new Set(data.errorRoutes || [])

  // Helper to check if SQL requests markdown field
  const wantsMarkdown = (sql: string) => sql.includes('SELECT *') || sql.toLowerCase().includes('markdown')

  return {
    dialect: 'sqlite' as const,
    all: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      // Parse basic queries
      const isErrorQuery = sql.includes('is_error = 1') || (params.includes(1) && sql.includes('is_error'))
      const excludeErrors = sql.includes('is_error = 0')
      const includeMarkdown = wantsMarkdown(sql)

      if (isErrorQuery) {
        return pages.filter(p => errorRoutes.has(p.route)).map(p => ({
          route: p.route,
          title: p.title,
          description: p.description,
          ...(includeMarkdown ? { markdown: p.markdown } : {}),
          headings: p.headings,
          keywords: JSON.stringify(p.keywords),
          updated_at: p.updatedAt,
          is_error: 1,
          indexed: 0,
        })) as T[]
      }

      const filtered = excludeErrors ? pages.filter(p => !errorRoutes.has(p.route)) : pages
      return filtered.map(p => ({
        route: p.route,
        title: p.title,
        description: p.description,
        ...(includeMarkdown ? { markdown: p.markdown } : {}),
        headings: p.headings,
        keywords: JSON.stringify(p.keywords),
        updated_at: p.updatedAt,
        is_error: errorRoutes.has(p.route) ? 1 : 0,
        indexed: 1,
      })) as T[]
    },
    first: async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
      if (sql.includes('WHERE route = ?')) {
        const route = params[0] as string
        const page = pages.find(p => p.route === route)
        if (!page)
          return undefined
        const includeMarkdown = wantsMarkdown(sql)
        return {
          route: page.route,
          title: page.title,
          description: page.description,
          ...(includeMarkdown ? { markdown: page.markdown } : {}),
          headings: page.headings,
          keywords: JSON.stringify(page.keywords),
          updated_at: page.updatedAt,
          is_error: errorRoutes.has(page.route) ? 1 : 0,
          indexed: 1,
        } as T
      }
      return undefined
    },
    exec: async (_query: string, _params: unknown[] = []): Promise<void> => {
      // No-op for prerender (read-only)
    },
  }
}

export interface PageRow {
  id: number
  route: string
  route_key: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string
  content_hash: string | null
  updated_at: string
  indexed_at: number
  is_error: number
  indexed: number
  source: 'prerender' | 'runtime'
  last_seen_at: number | null
  indexnow_synced_at: number | null
}

export interface PageEntry {
  route: string
  title: string
  description: string
  headings: Array<Record<string, string>>
  keywords: string[]
  updatedAt: string
  isError: boolean
}

export interface PageData extends PageEntry {
  markdown: string
}

export interface SearchResult {
  route: string
  title: string
  description: string
  score: number
}

// ============================================================================
// Unified Query Interface
// ============================================================================

export interface QueryPagesOptions {
  route?: string
  includeMarkdown?: boolean
  where?: {
    pending?: boolean // indexed = 0
    hasError?: boolean // is_error = 1
    source?: 'prerender' | 'runtime'
  }
  limit?: number
  offset?: number
}

function buildWhereClause(where?: QueryPagesOptions['where']): { sql: string, params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (where?.pending !== undefined) {
    conditions.push('indexed = ?')
    params.push(where.pending ? 0 : 1)
  }
  if (where?.hasError !== undefined) {
    conditions.push('is_error = ?')
    params.push(where.hasError ? 1 : 0)
  }
  if (where?.source) {
    conditions.push('source = ?')
    params.push(where.source)
  }

  // Default: exclude errors unless explicitly querying errors
  if (where?.hasError === undefined) {
    conditions.push('is_error = 0')
  }

  return {
    sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  }
}

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json)
    return fallback
  try {
    return JSON.parse(json) as T
  }
  catch {
    return fallback
  }
}

function rowToEntry(row: PageRow): PageEntry {
  return {
    route: row.route,
    title: row.title,
    description: row.description,
    headings: safeJsonParse<Array<Record<string, string>>>(row.headings, []),
    keywords: safeJsonParse<string[]>(row.keywords, []),
    updatedAt: row.updated_at,
    isError: row.is_error === 1,
  }
}

function rowToData(row: PageRow): PageData {
  return {
    ...rowToEntry(row),
    markdown: row.markdown,
  }
}

/**
 * Get lastmod (updatedAt) for all indexed pages
 * Returns a Map for O(1) lookup when enriching sitemaps
 */
export async function getPageLastmods(
  event: H3Event | undefined,
): Promise<Map<string, string>> {
  const db = await getDb(event)
  if (!db)
    return new Map()

  const rows = await db.all<{ route: string, updated_at: string }>(
    'SELECT route, updated_at FROM ai_ready_pages WHERE indexed = 1 AND is_error = 0',
  )

  const map = new Map<string, string>()
  for (const row of rows) {
    if (row.route && row.updated_at) {
      map.set(row.route, row.updated_at)
    }
  }
  return map
}

/**
 * Unified page query function
 * @param event - H3Event (optional, used for db context)
 * @param options - Query options
 */
export async function queryPages(event?: H3Event, options?: QueryPagesOptions): Promise<PageEntry[] | PageData[]>
export async function queryPages(event: H3Event | undefined, options: QueryPagesOptions & { route: string }): Promise<PageEntry | PageData | undefined>
export async function queryPages(event: H3Event | undefined, options: QueryPagesOptions & { route: string, includeMarkdown: true }): Promise<PageData | undefined>
export async function queryPages(event: H3Event | undefined, options: QueryPagesOptions & { includeMarkdown: true }): Promise<PageData[]>
export async function queryPages(
  event?: H3Event,
  options: QueryPagesOptions = {},
): Promise<PageEntry | PageData | PageEntry[] | PageData[] | undefined> {
  const { route, includeMarkdown, where, limit, offset } = options

  const db = await getDb(event)
  if (!db)
    return route ? undefined : []

  // Single page lookup
  if (route) {
    const row = await db.first<PageRow>('SELECT * FROM ai_ready_pages WHERE route = ?', [route])
    if (!row)
      return undefined
    return includeMarkdown ? rowToData(row) : rowToEntry(row)
  }

  // Build query
  const { sql: whereClause, params } = buildWhereClause(where)
  let sql = `SELECT * FROM ai_ready_pages ${whereClause}`

  if (limit) {
    sql += ` LIMIT ?`
    params.push(limit)
    if (offset) {
      sql += ` OFFSET ?`
      params.push(offset)
    }
  }

  const rows = await db.all<PageRow>(sql, params)
  return includeMarkdown ? rows.map(rowToData) : rows.map(rowToEntry)
}

export interface StreamPagesOptions {
  batchSize?: number
}

/**
 * Stream pages using cursor-based pagination
 * Yields pages one batch at a time to avoid loading all into memory
 */
export async function* streamPages(
  event?: H3Event,
  options: StreamPagesOptions = {},
): AsyncGenerator<PageData, void, unknown> {
  const db = await getDb(event)
  if (!db)
    return

  const batchSize = options.batchSize || 50
  let offset = 0

  while (true) {
    const rows = await db.all<PageRow>(
      `SELECT * FROM ai_ready_pages WHERE is_error = 0 ORDER BY route LIMIT ? OFFSET ?`,
      [batchSize, offset],
    )

    if (rows.length === 0)
      break

    for (const row of rows) {
      yield rowToData(row)
    }

    if (rows.length < batchSize)
      break

    offset += batchSize
  }
}

export interface CountPagesOptions {
  where?: {
    pending?: boolean
    hasError?: boolean
    source?: 'prerender' | 'runtime'
  }
}

/**
 * Count pages matching criteria
 */
export async function countPages(event?: H3Event, options: CountPagesOptions = {}): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const { sql: whereClause, params } = buildWhereClause(options.where)
  const row = await db.first<{ count: number }>(
    `SELECT COUNT(*) as count FROM ai_ready_pages ${whereClause}`,
    params,
  )
  return row?.count || 0
}

// ============================================================================
// Full-text Search
// ============================================================================

export interface SearchPagesOptions {
  limit?: number
}

/**
 * Full-text search using FTS5
 * Note: FTS is only available at runtime, not during prerender
 */
export async function searchPages(
  event: H3Event | undefined,
  query: string,
  options: SearchPagesOptions = {},
): Promise<SearchResult[]> {
  // FTS not available in dev or prerender
  if (import.meta.dev || import.meta.prerender)
    return []

  const db = await getDb(event)
  if (!db)
    return []

  const { limit = 10 } = options

  // Sanitize and prepare query for FTS5
  const sanitized = query.replace(RE_FTS_CHARS, ' ').trim()
  if (!sanitized)
    return []

  // Add prefix matching for partial words
  const terms = sanitized.split(RE_WHITESPACE).map(t => `${t}*`).join(' ')

  // BM25 weights: route, title, description, markdown, headings, keywords
  return db.all<SearchResult>(`
    SELECT p.route, p.title, p.description, bm25(ai_ready_pages_fts, 5.0, 3.0, 1.0, 0.5, 2.0, 2.0) as score
    FROM ai_ready_pages_fts
    JOIN ai_ready_pages p ON ai_ready_pages_fts.rowid = p.id
    WHERE ai_ready_pages_fts MATCH ?
    ORDER BY score
    LIMIT ?
  `, [terms, limit])
}

// ============================================================================
// Write Operations
// ============================================================================

export interface UpsertPageInput {
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

/**
 * Insert or update a page
 */
export async function upsertPage(event: H3Event | undefined, page: UpsertPageInput): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  const routeKey = normalizeRouteKey(page.route)
  const keywordsJson = JSON.stringify(page.keywords)
  const indexedAt = Date.now()
  const source = page.source || 'runtime'
  const lastSeenAt = source === 'runtime' ? indexedAt : null

  await db.exec(`
    INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(route) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      markdown = excluded.markdown,
      headings = excluded.headings,
      keywords = excluded.keywords,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at,
      indexed_at = excluded.indexed_at,
      is_error = excluded.is_error,
      indexed = 1,
      source = excluded.source,
      last_seen_at = excluded.last_seen_at
  `, [page.route, routeKey, page.title, page.description, page.markdown, page.headings, keywordsJson, page.contentHash || null, page.updatedAt, indexedAt, page.isError ? 1 : 0, source, lastSeenAt])
}

/**
 * Check if a page is fresh (within TTL)
 */
export async function isPageFresh(event: H3Event | undefined, route: string, ttlSeconds: number): Promise<boolean> {
  if (ttlSeconds <= 0)
    return false

  const db = await getDb(event)
  if (!db)
    return false

  const row = await db.first<{ indexed_at: number }>('SELECT indexed_at FROM ai_ready_pages WHERE route = ?', [route])
  if (!row)
    return false
  const age = (Date.now() - row.indexed_at) / 1000
  return age < ttlSeconds
}

/**
 * Get existing content hash for a page (for change detection)
 * @internal
 */
export async function getPageHash(event: H3Event | undefined, route: string): Promise<string | null> {
  const db = await getDb(event)
  if (!db)
    return null

  const row = await db.first<{ content_hash: string | null }>('SELECT content_hash FROM ai_ready_pages WHERE route = ?', [route])
  return row?.content_hash || null
}

// ============================================================================
// Sitemap Seeding & Pruning
// ============================================================================

/**
 * Seed routes from sitemap (insert with indexed=0 if not exists)
 */
export async function seedRoutes(event: H3Event | undefined, routes: string[]): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const now = new Date().toISOString()
  const nowMs = Date.now()
  for (const route of routes) {
    const routeKey = normalizeRouteKey(route)
    await db.exec(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES (?, ?, '', '', '', '[]', '[]', ?, 0, 0, 0, 'runtime', ?)
      ON CONFLICT(route) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `, [route, routeKey, now, nowMs])
  }
  return routes.length
}

/**
 * Get sitemap seeded timestamp from _ai_ready_info
 */
export async function getSitemapSeededAt(event: H3Event | undefined): Promise<number | undefined> {
  const db = await getDb(event)
  if (!db)
    return undefined

  const row = await db.first<{ value: string }>('SELECT value FROM _ai_ready_info WHERE id = ?', ['sitemap_seeded_at'])
  return row ? Number.parseInt(row.value, 10) : undefined
}

/**
 * Set sitemap seeded timestamp
 */
export async function setSitemapSeededAt(event: H3Event | undefined, timestamp: number): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec('INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)', ['sitemap_seeded_at', String(timestamp)])
}

/**
 * Prune routes not seen in sitemap for longer than threshold
 * Only prunes routes with source='runtime' (never prerendered pages)
 */
export async function pruneStaleRoutes(event: H3Event | undefined, staleThresholdSeconds: number): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const threshold = Date.now() - (staleThresholdSeconds * 1000)

  const countRow = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM ai_ready_pages WHERE source = ? AND last_seen_at < ?',
    ['runtime', threshold],
  )
  const count = countRow?.count || 0

  if (count > 0) {
    await db.exec('DELETE FROM ai_ready_pages WHERE source = ? AND last_seen_at < ?', ['runtime', threshold])
  }
  return count
}

/**
 * Get stale routes that would be pruned (for preview)
 */
export async function getStaleRoutes(event: H3Event | undefined, staleThresholdSeconds: number): Promise<string[]> {
  const db = await getDb(event)
  if (!db)
    return []

  const threshold = Date.now() - (staleThresholdSeconds * 1000)
  const rows = await db.all<{ route: string }>(
    'SELECT route FROM ai_ready_pages WHERE source = ? AND last_seen_at < ?',
    ['runtime', threshold],
  )
  return rows.map(r => r.route)
}

// ============================================================================
// IndexNow Sync
// ============================================================================

/**
 * Get pages needing IndexNow sync (content changed since last sync)
 */
export async function getPagesNeedingIndexNowSync(
  event: H3Event | undefined,
  limit = 100,
): Promise<{ route: string }[]> {
  const db = await getDb(event)
  if (!db)
    return []

  return db.all<{ route: string }>(`
    SELECT route FROM ai_ready_pages
    WHERE indexed = 1
      AND is_error = 0
      AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)
    LIMIT ?
  `, [limit])
}

/**
 * Count pages needing IndexNow sync
 */
export async function countPagesNeedingIndexNowSync(
  event: H3Event | undefined,
): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const row = await db.first<{ count: number }>(`
    SELECT COUNT(*) as count FROM ai_ready_pages
    WHERE indexed = 1
      AND is_error = 0
      AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)
  `)
  return row?.count || 0
}

/**
 * Mark pages as synced to IndexNow
 */
export async function markIndexNowSynced(
  event: H3Event | undefined,
  routes: string[],
): Promise<void> {
  const db = await getDb(event)
  if (!db || routes.length === 0)
    return

  const now = Date.now()
  const placeholders = routes.map(() => '?').join(',')
  await db.exec(
    `UPDATE ai_ready_pages SET indexnow_synced_at = ? WHERE route IN (${placeholders})`,
    [now, ...routes],
  )
}

/**
 * Update IndexNow stats after submission
 * Uses atomic SQL to handle concurrent updates safely
 */
export async function updateIndexNowStats(
  event: H3Event | undefined,
  submitted: number,
  error?: string,
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  const now = Date.now()

  if (error) {
    await db.exec(
      'INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)',
      ['indexnow_last_error', error],
    )
  }
  else {
    // Atomic increment of total submitted count
    await db.exec(`
      INSERT INTO _ai_ready_info (id, value) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET value = CAST((CAST(value AS INTEGER) + ?) AS TEXT)
    `, ['indexnow_total_submitted', String(submitted), submitted])

    await db.exec(
      'INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)',
      ['indexnow_last_submitted_at', String(now)],
    )
    await db.exec(
      'DELETE FROM _ai_ready_info WHERE id = ?',
      ['indexnow_last_error'],
    )
  }
}

/**
 * Batch update for IndexNow: mark pages synced + update stats
 * Runs all queries in parallel for speed
 */
export async function batchIndexNowUpdate(
  event: H3Event | undefined,
  routes: string[],
  submitted: number,
): Promise<void> {
  const db = await getDb(event)
  if (!db || routes.length === 0)
    return

  const now = Date.now()
  const placeholders = routes.map(() => '?').join(',')

  // Run all updates in parallel
  await Promise.all([
    // Mark pages as synced
    db.exec(
      `UPDATE ai_ready_pages SET indexnow_synced_at = ? WHERE route IN (${placeholders})`,
      [now, ...routes],
    ),
    // Atomic increment total submitted
    db.exec(`
      INSERT INTO _ai_ready_info (id, value) VALUES ('indexnow_total_submitted', ?)
      ON CONFLICT(id) DO UPDATE SET value = CAST((CAST(value AS INTEGER) + ?) AS TEXT)
    `, [String(submitted), submitted]),
    // Update last submitted timestamp
    db.exec(
      'INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)',
      ['indexnow_last_submitted_at', String(now)],
    ),
    // Clear any previous error
    db.exec('DELETE FROM _ai_ready_info WHERE id = ?', ['indexnow_last_error']),
  ])
}

export interface IndexNowStats {
  totalSubmitted: number
  lastSubmittedAt: number | null
  lastError: string | null
}

/**
 * Get IndexNow stats
 */
export async function getIndexNowStats(
  event: H3Event | undefined,
): Promise<IndexNowStats> {
  const db = await getDb(event)
  if (!db)
    return { totalSubmitted: 0, lastSubmittedAt: null, lastError: null }

  const rows = await db.all<{ id: string, value: string }>(
    'SELECT id, value FROM _ai_ready_info WHERE id LIKE ?',
    ['indexnow_%'],
  )

  const stats: Record<string, string> = {}
  for (const row of rows) {
    stats[row.id] = row.value
  }

  return {
    totalSubmitted: Number.parseInt(stats.indexnow_total_submitted || '0', 10) || 0,
    lastSubmittedAt: stats.indexnow_last_submitted_at ? Number.parseInt(stats.indexnow_last_submitted_at, 10) : null,
    lastError: stats.indexnow_last_error || null,
  }
}

export interface IndexNowBackoffStatus {
  active: boolean
  until: number | null
  remainingMs: number | null
  attempt: number | null
}

/**
 * Get IndexNow backoff status for status endpoint
 */
export async function getIndexNowBackoff(
  event: H3Event | undefined,
): Promise<IndexNowBackoffStatus> {
  const db = await getDb(event)
  if (!db)
    return { active: false, until: null, remainingMs: null, attempt: null }

  const row = await db.first<{ value: string }>(
    'SELECT value FROM _ai_ready_info WHERE id = ?',
    ['indexnow_backoff'],
  )

  if (!row)
    return { active: false, until: null, remainingMs: null, attempt: null }

  const parsed = safeJsonParse<{ until: number, attempt: number } | null>(row.value, null)
  if (!parsed)
    return { active: false, until: null, remainingMs: null, attempt: null }

  const now = Date.now()
  const active = now < parsed.until

  return {
    active,
    until: parsed.until,
    remainingMs: active ? parsed.until - now : null,
    attempt: parsed.attempt,
  }
}

// ============================================================================
// IndexNow Submission Log (debug mode only)
// ============================================================================

export interface IndexNowLogEntry {
  id: number
  submittedAt: number
  urlCount: number
  success: boolean
  error: string | null
}

/**
 * Log an IndexNow submission attempt (for debug mode)
 */
export async function logIndexNowSubmission(
  event: H3Event | undefined,
  urlCount: number,
  success: boolean,
  error?: string,
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec(
    'INSERT INTO ai_ready_indexnow_log (submitted_at, url_count, success, error) VALUES (?, ?, ?, ?)',
    [Date.now(), urlCount, success ? 1 : 0, error || null],
  )

  // Keep only last 100 entries
  await db.exec(`
    DELETE FROM ai_ready_indexnow_log WHERE id NOT IN (
      SELECT id FROM ai_ready_indexnow_log ORDER BY submitted_at DESC LIMIT 100
    )
  `)
}

/**
 * Get recent IndexNow submission log entries
 */
export async function getIndexNowLog(
  event: H3Event | undefined,
  limit = 20,
): Promise<IndexNowLogEntry[]> {
  const db = await getDb(event)
  if (!db)
    return []

  const rows = await db.all<{
    id: number
    submitted_at: number
    url_count: number
    success: number
    error: string | null
  }>('SELECT * FROM ai_ready_indexnow_log ORDER BY submitted_at DESC LIMIT ?', [limit])

  return rows.map(row => ({
    id: row.id,
    submittedAt: row.submitted_at,
    urlCount: row.url_count,
    success: row.success === 1,
    error: row.error,
  }))
}

// ============================================================================
// Cron Run Logging
// ============================================================================

export interface CronRunRow {
  id: number
  started_at: number
  finished_at: number | null
  duration_ms: number | null
  pages_indexed: number
  pages_remaining: number
  indexnow_submitted: number
  indexnow_remaining: number
  errors: string
  status: 'running' | 'success' | 'partial' | 'error'
}

export interface CronRun {
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

function rowToCronRun(row: CronRunRow): CronRun {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    pagesIndexed: row.pages_indexed,
    pagesRemaining: row.pages_remaining,
    indexNowSubmitted: row.indexnow_submitted,
    indexNowRemaining: row.indexnow_remaining,
    errors: safeJsonParse<string[]>(row.errors, []),
    status: row.status,
  }
}

/**
 * Start a cron run and return its ID
 */
export async function startCronRun(event: H3Event | undefined): Promise<number | null> {
  const db = await getDb(event)
  if (!db)
    return null

  const now = Date.now()
  await db.exec(
    'INSERT INTO ai_ready_cron_runs (started_at, status) VALUES (?, ?)',
    [now, 'running'],
  )

  const row = await db.first<{ id: number }>('SELECT last_insert_rowid() as id')
  return row?.id || null
}

/**
 * Complete a cron run with results
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
  const db = await getDb(event)
  if (!db)
    return

  const now = Date.now()
  const row = await db.first<{ started_at: number }>('SELECT started_at FROM ai_ready_cron_runs WHERE id = ?', [runId])
  const durationMs = row ? now - row.started_at : null

  const status = result.errors.length > 0
    ? (result.pagesIndexed > 0 ? 'partial' : 'error')
    : 'success'

  await db.exec(`
    UPDATE ai_ready_cron_runs SET
      finished_at = ?,
      duration_ms = ?,
      pages_indexed = ?,
      pages_remaining = ?,
      indexnow_submitted = ?,
      indexnow_remaining = ?,
      errors = ?,
      status = ?
    WHERE id = ?
  `, [now, durationMs, result.pagesIndexed, result.pagesRemaining, result.indexNowSubmitted, result.indexNowRemaining, JSON.stringify(result.errors), status, runId])
}

/**
 * Get recent cron runs
 */
export async function getRecentCronRuns(
  event: H3Event | undefined,
  limit = 10,
): Promise<CronRun[]> {
  const db = await getDb(event)
  if (!db)
    return []

  const rows = await db.all<CronRunRow>(
    'SELECT * FROM ai_ready_cron_runs ORDER BY started_at DESC LIMIT ?',
    [limit],
  )
  return rows.map(rowToCronRun)
}

/**
 * Clean up old cron runs (keep last N)
 */
export async function cleanupOldCronRuns(
  event: H3Event | undefined,
  keepCount = 50,
): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const countRow = await db.first<{ count: number }>('SELECT COUNT(*) as count FROM ai_ready_cron_runs')
  const total = countRow?.count || 0

  if (total <= keepCount)
    return 0

  const deleteCount = total - keepCount
  await db.exec(`
    DELETE FROM ai_ready_cron_runs WHERE id IN (
      SELECT id FROM ai_ready_cron_runs ORDER BY started_at ASC LIMIT ?
    )
  `, [deleteCount])

  return deleteCount
}

/**
 * Clean up cron runs older than specified age
 */
export async function pruneCronRunsByAge(
  event: H3Event | undefined,
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const threshold = Date.now() - maxAgeMs

  const countRow = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM ai_ready_cron_runs WHERE started_at < ?',
    [threshold],
  )
  const count = countRow?.count || 0

  if (count > 0) {
    await db.exec('DELETE FROM ai_ready_cron_runs WHERE started_at < ?', [threshold])
  }

  return count
}

// ============================================================================
// Cron Fast-Path Status (single query for all checks)
// ============================================================================

export interface CronFastPathStatus {
  totalPages: number
  pendingPages: number
  indexNowPending: number
  lastStaleCheck: number | null
  buildId: string | null
  indexNowBackoff: { until: number, attempt: number } | null
  sitemapsNeedCrawl: number
}

/**
 * Get all cron status in a single query for fast-path checking
 * Reduces 6+ sequential DB calls to 1
 */
export async function getCronFastPathStatus(
  event: H3Event | undefined,
  sitemapIntervalMinutes = 5,
): Promise<CronFastPathStatus | null> {
  const db = await getDb(event)
  if (!db)
    return null

  const sitemapThreshold = Date.now() - sitemapIntervalMinutes * 60 * 1000

  const row = await db.first<{
    total_pages: number
    pending_pages: number
    indexnow_pending: number
    last_stale_check: string | null
    build_id: string | null
    indexnow_backoff: string | null
    sitemaps_need_crawl: number
  }>(`
    SELECT
      (SELECT COUNT(*) FROM ai_ready_pages) as total_pages,
      (SELECT COUNT(*) FROM ai_ready_pages WHERE indexed = 0 AND is_error = 0) as pending_pages,
      (SELECT COUNT(*) FROM ai_ready_pages WHERE indexed = 1 AND is_error = 0 AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)) as indexnow_pending,
      (SELECT value FROM _ai_ready_info WHERE id = 'last_stale_check') as last_stale_check,
      (SELECT value FROM _ai_ready_info WHERE id = 'build_id') as build_id,
      (SELECT value FROM _ai_ready_info WHERE id = 'indexnow_backoff') as indexnow_backoff,
      (SELECT COUNT(*) FROM ai_ready_sitemaps WHERE (last_crawled_at IS NULL OR last_crawled_at < ?) AND error_count < 10) as sitemaps_need_crawl
  `, [sitemapThreshold])

  if (!row)
    return null

  return {
    totalPages: row.total_pages,
    pendingPages: row.pending_pages,
    indexNowPending: row.indexnow_pending,
    lastStaleCheck: row.last_stale_check ? Number.parseInt(row.last_stale_check, 10) : null,
    buildId: row.build_id,
    indexNowBackoff: safeJsonParse<{ until: number, attempt: number } | null>(row.indexnow_backoff, null),
    sitemapsNeedCrawl: row.sitemaps_need_crawl,
  }
}

// ============================================================================
// Cron Lock (prevent overlapping runs)
// ============================================================================

const CRON_LOCK_TTL_MS = 300_000 // 5 minutes - stale lock threshold (matches cron interval)

/**
 * Try to acquire cron lock. Returns true if acquired, false if another run is active.
 * Uses atomic INSERT OR REPLACE with conditional check to prevent race conditions.
 */
export async function tryAcquireCronLock(event: H3Event | undefined): Promise<boolean> {
  const db = await getDb(event)
  if (!db)
    return true // No DB = no lock needed

  const now = Date.now()
  const staleThreshold = now - CRON_LOCK_TTL_MS

  // Atomic: only acquire if no lock exists or existing lock is stale
  await db.exec(`
    INSERT INTO _ai_ready_info (id, value) VALUES ('cron_lock', ?)
    ON CONFLICT(id) DO UPDATE SET value = ?
    WHERE CAST(value AS INTEGER) < ?
  `, [String(now), String(now), staleThreshold])

  // Verify we hold the lock (our timestamp was written)
  const row = await db.first<{ value: string }>('SELECT value FROM _ai_ready_info WHERE id = ?', ['cron_lock'])
  return row?.value === String(now)
}

/**
 * Release cron lock
 */
export async function releaseCronLock(event: H3Event | undefined): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec('DELETE FROM _ai_ready_info WHERE id = ?', ['cron_lock'])
}

export interface CronLockStatus {
  held: boolean
  since: number | null
  elapsedMs: number | null
  stale: boolean
}

/**
 * Get cron lock status for status endpoint
 */
export async function getCronLockStatus(event: H3Event | undefined): Promise<CronLockStatus> {
  const db = await getDb(event)
  if (!db)
    return { held: false, since: null, elapsedMs: null, stale: false }

  const row = await db.first<{ value: string }>(
    'SELECT value FROM _ai_ready_info WHERE id = ?',
    ['cron_lock'],
  )

  if (!row)
    return { held: false, since: null, elapsedMs: null, stale: false }

  const lockTime = Number.parseInt(row.value, 10)
  const now = Date.now()
  const elapsed = now - lockTime
  const stale = elapsed >= CRON_LOCK_TTL_MS

  return {
    held: !stale,
    since: lockTime,
    elapsedMs: elapsed,
    stale,
  }
}

// ============================================================================
// Sitemap Tracking (Multi-Sitemap Support)
// ============================================================================

export interface SitemapEntry {
  name: string
  route: string
  lastCrawledAt: number | null
  urlCount: number
  errorCount: number
  lastError: string | null
}

interface SitemapRow {
  name: string
  route: string
  last_crawled_at: number | null
  url_count: number
  error_count: number
  last_error: string | null
}

function rowToSitemapEntry(row: SitemapRow): SitemapEntry {
  return {
    name: row.name,
    route: row.route,
    lastCrawledAt: row.last_crawled_at,
    urlCount: row.url_count,
    errorCount: row.error_count,
    lastError: row.last_error,
  }
}

/**
 * Sync sitemap list from config to DB
 * Inserts new sitemaps, removes stale ones
 */
export async function syncSitemaps(
  event: H3Event | undefined,
  sitemaps: Array<{ name: string, route: string }>,
): Promise<{ added: number, removed: number }> {
  const db = await getDb(event)
  if (!db)
    return { added: 0, removed: 0 }

  const existingRows = await db.all<{ name: string }>('SELECT name FROM ai_ready_sitemaps')
  const existingNames = new Set(existingRows.map(r => r.name))
  const configNames = new Set(sitemaps.map(s => s.name))

  let added = 0
  let removed = 0

  // Insert new sitemaps
  for (const sitemap of sitemaps) {
    if (!existingNames.has(sitemap.name)) {
      await db.exec(
        'INSERT INTO ai_ready_sitemaps (name, route) VALUES (?, ?)',
        [sitemap.name, sitemap.route],
      )
      added++
    }
  }

  // Remove sitemaps no longer in config
  for (const name of existingNames) {
    if (!configNames.has(name)) {
      await db.exec('DELETE FROM ai_ready_sitemaps WHERE name = ?', [name])
      removed++
    }
  }

  return { added, removed }
}

/**
 * Get next sitemap to crawl
 * Prioritizes: sitemaps with errors (for retry), then oldest crawled
 * Skips sitemaps crawled within minIntervalMinutes (default 5 min)
 */
export async function getNextSitemapToCrawl(
  event: H3Event | undefined,
  minIntervalMinutes = 5,
): Promise<SitemapEntry | null> {
  const db = await getDb(event)
  if (!db)
    return null

  // Calculate threshold as milliseconds timestamp (matching how we store last_crawled_at)
  const threshold = Date.now() - minIntervalMinutes * 60 * 1000

  // First try sitemaps with errors (retry after interval)
  // Only retry if error_count < 10 to avoid infinite retries
  const errorRow = await db.first<SitemapRow>(`
    SELECT * FROM ai_ready_sitemaps
    WHERE error_count > 0 AND error_count < 10
      AND (last_crawled_at IS NULL OR last_crawled_at < ?)
    ORDER BY last_crawled_at ASC NULLS FIRST
    LIMIT 1
  `, [threshold])
  if (errorRow)
    return rowToSitemapEntry(errorRow)

  // Otherwise get oldest crawled (or never crawled) outside interval
  const row = await db.first<SitemapRow>(`
    SELECT * FROM ai_ready_sitemaps
    WHERE error_count = 0
      AND (last_crawled_at IS NULL OR last_crawled_at < ?)
    ORDER BY last_crawled_at ASC NULLS FIRST
    LIMIT 1
  `, [threshold])
  return row ? rowToSitemapEntry(row) : null
}

/**
 * Mark sitemap as successfully crawled
 */
export async function markSitemapCrawled(
  event: H3Event | undefined,
  name: string,
  urlCount: number,
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec(`
    UPDATE ai_ready_sitemaps SET
      last_crawled_at = ?,
      url_count = ?,
      error_count = 0,
      last_error = NULL
    WHERE name = ?
  `, [Date.now(), urlCount, name])
}

/**
 * Mark sitemap crawl as failed
 */
export async function markSitemapError(
  event: H3Event | undefined,
  name: string,
  error: string,
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec(`
    UPDATE ai_ready_sitemaps SET
      last_crawled_at = ?,
      error_count = error_count + 1,
      last_error = ?
    WHERE name = ?
  `, [Date.now(), error, name])
}

/**
 * Reset all sitemap errors (called on build_id change)
 */
export async function resetSitemapErrors(event: H3Event | undefined): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const countRow = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM ai_ready_sitemaps WHERE error_count > 0',
  )
  const count = countRow?.count || 0

  if (count > 0) {
    await db.exec('UPDATE ai_ready_sitemaps SET error_count = 0, last_error = NULL, last_crawled_at = NULL')
  }

  return count
}

/**
 * Get all sitemaps with their status
 */
export async function getSitemapStatus(
  event: H3Event | undefined,
): Promise<SitemapEntry[]> {
  const db = await getDb(event)
  if (!db)
    return []

  const rows = await db.all<SitemapRow>('SELECT * FROM ai_ready_sitemaps ORDER BY name')
  return rows.map(rowToSitemapEntry)
}

// ============================================================================
// Page Activity Stats
// ============================================================================

export interface RecentPageActivity {
  route: string
  title: string
  indexedAt: number
}

/**
 * Get recently indexed pages
 */
export async function getRecentlyIndexedPages(
  event: H3Event | undefined,
  limit = 10,
): Promise<RecentPageActivity[]> {
  const db = await getDb(event)
  if (!db)
    return []

  const rows = await db.all<{ route: string, title: string, indexed_at: number }>(
    'SELECT route, title, indexed_at FROM ai_ready_pages WHERE indexed = 1 AND is_error = 0 ORDER BY indexed_at DESC LIMIT ?',
    [limit],
  )
  return rows.map(r => ({ route: r.route, title: r.title, indexedAt: r.indexed_at }))
}

/**
 * Count pages indexed in a time window
 */
export async function countRecentlyIndexed(
  event: H3Event | undefined,
  sinceMs: number,
): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const threshold = Date.now() - sinceMs
  const row = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM ai_ready_pages WHERE indexed = 1 AND indexed_at > ?',
    [threshold],
  )
  return row?.count || 0
}
