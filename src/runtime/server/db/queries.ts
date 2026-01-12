import type { H3Event } from 'h3'
import type { DatabaseAdapter } from './shared'
import { useEvent } from 'nitropack/runtime'
import { useDatabase } from './index'
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

/** Get database, with dev mode warning and prerender handling */
async function getDb(event?: H3Event): Promise<DatabaseAdapter | null> {
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

  // Runtime: use database via db0
  return useDatabase(getEventFromContext(event))
}

/** Get prerender database adapter (reads from build-time SQLite) */
async function getPrerenderDb(): Promise<DatabaseAdapter> {
  const m = await import('#ai-ready-virtual/read-page-data.mjs')
  const data = await (m as unknown as {
    readPageDataFromFilesystem: () => Promise<{ pages: PageData[], errorRoutes: string[] }>
  }).readPageDataFromFilesystem()

  // Create a minimal adapter that returns the cached data
  const pages = data.pages || []
  const errorRoutes = new Set(data.errorRoutes || [])

  return {
    all: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      // Parse basic queries
      const isErrorQuery = sql.includes('is_error = 1') || (params.includes(1) && sql.includes('is_error'))
      const excludeErrors = sql.includes('is_error = 0')

      if (isErrorQuery) {
        return pages.filter(p => errorRoutes.has(p.route)).map(p => ({
          ...p,
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
        markdown: p.markdown,
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
        return {
          route: page.route,
          title: page.title,
          description: page.description,
          markdown: page.markdown,
          headings: page.headings,
          keywords: JSON.stringify(page.keywords),
          updated_at: page.updatedAt,
          is_error: errorRoutes.has(page.route) ? 1 : 0,
          indexed: 1,
        } as T
      }
      return undefined
    },
    exec: async (): Promise<void> => {
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
  headings: string
  keywords: string[]
  updatedAt: string
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

function rowToEntry(row: PageRow): PageEntry {
  return {
    route: row.route,
    title: row.title,
    description: row.description,
    headings: row.headings,
    keywords: JSON.parse(row.keywords || '[]'),
    updatedAt: row.updated_at,
  }
}

function rowToData(row: PageRow): PageData {
  return {
    ...rowToEntry(row),
    markdown: row.markdown,
  }
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
  const sanitized = query.replace(/[*:^"()]/g, ' ').trim()
  if (!sanitized)
    return []

  // Add prefix matching for partial words
  const terms = sanitized.split(/\s+/).map(t => `${t}*`).join(' ')

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
