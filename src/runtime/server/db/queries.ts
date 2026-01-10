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
function normalizeRouteKey(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, ':') || 'index'
}

/**
 * Convert database row to PageEntry
 */
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

/**
 * Get all non-error pages
 */
export async function getAllPages(db: DatabaseAdapter): Promise<PageEntry[]> {
  const rows = await db.all<PageRow>('SELECT * FROM ai_ready_pages WHERE is_error = 0')
  return rows.map(rowToEntry)
}

/**
 * Get a single page by route
 */
export async function getPage(db: DatabaseAdapter, route: string): Promise<PageEntry | undefined> {
  const row = await db.first<PageRow>('SELECT * FROM ai_ready_pages WHERE route = ?', [route])
  return row ? rowToEntry(row) : undefined
}

/**
 * Get a page with markdown content
 */
export async function getPageWithMarkdown(db: DatabaseAdapter, route: string): Promise<PageData | undefined> {
  const row = await db.first<PageRow>('SELECT * FROM ai_ready_pages WHERE route = ?', [route])
  return row ? { ...rowToEntry(row), markdown: row.markdown } : undefined
}

/**
 * Full-text search using FTS5
 * @param query Search query string
 * @param opts Search options
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
}): Promise<void> {
  const routeKey = normalizeRouteKey(page.route)
  const keywordsJson = JSON.stringify(page.keywords)
  const indexedAt = Date.now()

  await db.exec(`
    INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(route) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      markdown = excluded.markdown,
      headings = excluded.headings,
      keywords = excluded.keywords,
      updated_at = excluded.updated_at,
      indexed_at = excluded.indexed_at,
      is_error = excluded.is_error,
      indexed = 1
  `, [page.route, routeKey, page.title, page.description, page.markdown, page.headings, keywordsJson, page.updatedAt, indexedAt, page.isError ? 1 : 0])
}

/**
 * Get all error routes
 */
export async function getErrorRoutes(db: DatabaseAdapter): Promise<string[]> {
  const rows = await db.all<{ route: string }>('SELECT route FROM ai_ready_pages WHERE is_error = 1')
  return rows.map(r => r.route)
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

/**
 * Delete a page by route
 */
export async function deletePage(db: DatabaseAdapter, route: string): Promise<void> {
  await db.exec('DELETE FROM ai_ready_pages WHERE route = ?', [route])
}

/**
 * Get page count
 */
export async function getPageCount(db: DatabaseAdapter): Promise<number> {
  const row = await db.first<{ count: number }>('SELECT COUNT(*) as count FROM ai_ready_pages WHERE is_error = 0')
  return row?.count || 0
}

/**
 * Check if database has any pages
 */
export async function hasPages(db: DatabaseAdapter): Promise<boolean> {
  const count = await getPageCount(db)
  return count > 0
}

/**
 * Seed routes from sitemap (insert with indexed=0 if not exists)
 */
export async function seedRoutes(db: DatabaseAdapter, routes: string[]): Promise<number> {
  const now = new Date().toISOString()
  for (const route of routes) {
    const routeKey = normalizeRouteKey(route)
    // Only insert if doesn't exist - don't overwrite existing indexed pages
    await db.exec(`
      INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed)
      VALUES (?, ?, '', '', '', '[]', '[]', ?, 0, 0, 0)
      ON CONFLICT(route) DO NOTHING
    `, [route, routeKey, now])
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
