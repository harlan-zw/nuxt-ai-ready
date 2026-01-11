import type { DatabaseAdapter } from './schema'

export interface PageRow {
  id: number
  route: string
  route_key: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string
  updated_at: string
  indexed_at: number
  is_error: number
  indexed: number
  source: 'prerender' | 'runtime'
  last_seen_at: number | null
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

/**
 * Normalize route to storage key format
 * e.g., '/about/team' -> 'about:team', '/' -> 'index'
 */
export function normalizeRouteKey(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, ':') || 'index'
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

export interface CountPagesOptions {
  where?: {
    pending?: boolean
    hasError?: boolean
    source?: 'prerender' | 'runtime'
  }
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
 */
export async function queryPages(db: DatabaseAdapter, options?: QueryPagesOptions): Promise<PageEntry[] | PageData[]>
export async function queryPages(db: DatabaseAdapter, options: QueryPagesOptions & { route: string }): Promise<PageEntry | PageData | undefined>
export async function queryPages(db: DatabaseAdapter, options: QueryPagesOptions & { route: string, includeMarkdown: true }): Promise<PageData | undefined>
export async function queryPages(db: DatabaseAdapter, options: QueryPagesOptions & { includeMarkdown: true }): Promise<PageData[]>
export async function queryPages(
  db: DatabaseAdapter,
  options: QueryPagesOptions = {},
): Promise<PageEntry | PageData | PageEntry[] | PageData[] | undefined> {
  const { route, includeMarkdown, where, limit, offset } = options

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

/**
 * Count pages matching criteria
 */
export async function countPages(db: DatabaseAdapter, options: CountPagesOptions = {}): Promise<number> {
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

/**
 * Full-text search using FTS5
 */
export async function searchPages(
  db: DatabaseAdapter,
  query: string,
  opts: { limit?: number } = {},
): Promise<SearchResult[]> {
  const { limit = 10 } = opts

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

/**
 * Insert or update a page
 */
export async function upsertPage(db: DatabaseAdapter, page: {
  route: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string[]
  updatedAt: string
  isError?: boolean
  source?: 'prerender' | 'runtime'
}): Promise<void> {
  const routeKey = normalizeRouteKey(page.route)
  const keywordsJson = JSON.stringify(page.keywords)
  const indexedAt = Date.now()
  const source = page.source || 'runtime'
  const lastSeenAt = source === 'runtime' ? indexedAt : null

  await db.exec(`
    INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(route) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      markdown = excluded.markdown,
      headings = excluded.headings,
      keywords = excluded.keywords,
      updated_at = excluded.updated_at,
      indexed_at = excluded.indexed_at,
      is_error = excluded.is_error,
      indexed = 1,
      source = excluded.source,
      last_seen_at = excluded.last_seen_at
  `, [page.route, routeKey, page.title, page.description, page.markdown, page.headings, keywordsJson, page.updatedAt, indexedAt, page.isError ? 1 : 0, source, lastSeenAt])
}

/**
 * Delete a page by route
 */
export async function deletePage(db: DatabaseAdapter, route: string): Promise<void> {
  await db.exec('DELETE FROM ai_ready_pages WHERE route = ?', [route])
}

/**
 * Check if a page is fresh (within TTL)
 */
export async function isPageFresh(db: DatabaseAdapter, route: string, ttlSeconds: number): Promise<boolean> {
  if (ttlSeconds <= 0)
    return false
  const row = await db.first<{ indexed_at: number }>('SELECT indexed_at FROM ai_ready_pages WHERE route = ?', [route])
  if (!row)
    return false
  const age = (Date.now() - row.indexed_at) / 1000
  return age < ttlSeconds
}

// ============================================================================
// Sitemap Seeding & Pruning
// ============================================================================

/**
 * Seed routes from sitemap (insert with indexed=0 if not exists)
 */
export async function seedRoutes(db: DatabaseAdapter, routes: string[]): Promise<number> {
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
 * Get one unindexed route for background indexing
 */
export async function getNextUnindexedRoute(db: DatabaseAdapter): Promise<string | undefined> {
  const row = await db.first<{ route: string }>('SELECT route FROM ai_ready_pages WHERE indexed = 0 LIMIT 1')
  return row?.route
}

/**
 * Get count of unindexed pages
 */
export async function getUnindexedCount(db: DatabaseAdapter): Promise<number> {
  const row = await db.first<{ count: number }>('SELECT COUNT(*) as count FROM ai_ready_pages WHERE indexed = 0')
  return row?.count || 0
}

/**
 * Get sitemap seeded timestamp from _ai_ready_info
 */
export async function getSitemapSeededAt(db: DatabaseAdapter): Promise<number | undefined> {
  const row = await db.first<{ value: string }>('SELECT value FROM _ai_ready_info WHERE id = ?', ['sitemap_seeded_at'])
  return row ? Number.parseInt(row.value, 10) : undefined
}

/**
 * Set sitemap seeded timestamp
 */
export async function setSitemapSeededAt(db: DatabaseAdapter, timestamp: number): Promise<void> {
  await db.exec('INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)', ['sitemap_seeded_at', String(timestamp)])
}

/**
 * Prune routes not seen in sitemap for longer than threshold
 * Only prunes routes with source='runtime' (never prerendered pages)
 */
export async function pruneStaleRoutes(db: DatabaseAdapter, staleThresholdSeconds: number): Promise<number> {
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
export async function getStaleRoutes(db: DatabaseAdapter, staleThresholdSeconds: number): Promise<string[]> {
  const threshold = Date.now() - (staleThresholdSeconds * 1000)
  const rows = await db.all<{ route: string }>(
    'SELECT route FROM ai_ready_pages WHERE source = ? AND last_seen_at < ?',
    ['runtime', threshold],
  )
  return rows.map(r => r.route)
}
