import type { H3Event } from '#nuxtseo/h3'
import type { RuntimeI18nConfig } from '../utils/i18n'
import type { SitemapCrawlState } from '../utils/sitemap-crawl-state'
import type { RawExecutor } from './drizzle/raw'
import { randomUUID } from 'uncrypto'
import { useEvent, useRuntimeConfig } from '#nuxtseo/nitro'
import { createUniversalContext } from '../utils/context'
import { resolveLocaleFromRoute } from '../utils/i18n'
import { parseSitemapCrawlState, serializeSitemapCrawlState } from '../utils/sitemap-crawl-state'
import { initSchema } from './drizzle/queries'
import { useRawDb } from './drizzle/raw'
import { normalizeRoute, normalizeRouteKey } from './shared'

/**
 * Resolve a route's locale, deferring to the explicit value when supplied.
 * Falls back to the runtime i18n config (set when @nuxtjs/i18n is detected at
 * build time). Returns '' when no i18n is configured, matching the schema's
 * default for non-i18n sites.
 *
 * The host comes from the page's own URL (site URL + route), never from the
 * triggering request: cron and poll requests can arrive on any domain, which
 * would otherwise decide the locale of every indexed page on multi-domain
 * i18n sites.
 */
function deriveLocale(event: H3Event | undefined, route: string, explicit?: string): string {
  if (explicit !== undefined)
    return explicit
  const cfg = useRuntimeConfig(event) as { 'nuxt-ai-ready'?: { i18n?: RuntimeI18nConfig | null } }
  const i18n = cfg['nuxt-ai-ready']?.i18n
  if (!i18n)
    return ''
  const siteUrl = createUniversalContext(event).siteUrl
  let host: string | undefined
  try {
    host = siteUrl ? new URL(siteUrl).host : undefined
  }
  catch {
    host = undefined
  }
  return resolveLocaleFromRoute(route, i18n, host ? { host } : undefined).locale
}

/** Try to get the current H3Event from context or use provided event */
function getEventFromContext(providedEvent?: H3Event): H3Event | undefined {
  if (providedEvent)
    return providedEvent
  try {
    return useEvent() as H3Event
  }
  catch {
    return undefined
  }
}

let devWarningShown = false
type SchemaInitializationState
  = | { _tag: 'Uninitialized' }
    | { _tag: 'Initializing', promise: Promise<void> }
    | { _tag: 'Initialized' }

let schemaInitializationState: SchemaInitializationState = { _tag: 'Uninitialized' }

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

  // `aiReady.database: false` ships no driver. Callers treat a null database
  // as "no page data", the same as dev, so llms.txt degrades to the sitemap.
  const cfg = useRuntimeConfig(resolvedEvent) as { 'nuxt-ai-ready'?: { database?: { _tag?: string } } }
  if (cfg['nuxt-ai-ready']?.database?._tag === 'Disabled')
    return null

  const db = await useRawDb(resolvedEvent)

  if (schemaInitializationState._tag === 'Uninitialized') {
    const promise = initSchema(resolvedEvent)
      .then(() => {
        schemaInitializationState = { _tag: 'Initialized' }
      })
      .catch((error) => {
        schemaInitializationState = { _tag: 'Uninitialized' }
        throw error
      })
    schemaInitializationState = { _tag: 'Initializing', promise }
  }
  if (schemaInitializationState._tag === 'Initializing')
    await schemaInitializationState.promise

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
        return [...errorRoutes].map(route => ({
          route,
          title: '',
          description: '',
          ...(includeMarkdown ? { markdown: '' } : {}),
          headings: '[]',
          keywords: '[]',
          updated_at: '',
          is_error: 1,
          indexed: 0,
          locale: '',
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
        locale: p.locale || '',
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
          locale: page.locale || '',
        } as T
      }
      return undefined
    },
    exec: async (_query: string, _params: unknown[] = []): Promise<void> => {
      // No-op for prerender (read-only)
    },
    batch: async (_queries: { sql: string, params?: unknown[] }[]): Promise<void> => {
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
  locale: string | null
}

export interface PageEntry {
  route: string
  title: string
  description: string
  headings: Array<Record<string, string>>
  keywords: string[]
  updatedAt: string
  isError: boolean
  locale: string
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

type DatabaseNumber = number | string | bigint

function toNumber(value: DatabaseNumber | null | undefined, fallback = 0): number {
  return value === null || value === undefined ? fallback : Number(value)
}

function toNullableNumber(value: DatabaseNumber | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
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
    locale: row.locale || '',
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
export async function queryPages(event: H3Event | undefined, options: QueryPagesOptions & { route: string, includeMarkdown: true }): Promise<PageData | undefined>
export async function queryPages(event: H3Event | undefined, options: QueryPagesOptions & { route: string }): Promise<PageEntry | PageData | undefined>
export async function queryPages(event: H3Event | undefined, options: QueryPagesOptions & { includeMarkdown: true }): Promise<PageData[]>
export async function queryPages(event?: H3Event, options?: QueryPagesOptions): Promise<PageEntry[] | PageData[]>
export async function queryPages(
  event?: H3Event,
  options: QueryPagesOptions = {},
): Promise<PageEntry | PageData | PageEntry[] | PageData[] | undefined> {
  const { route, includeMarkdown, where, limit, offset } = options

  const db = await getDb(event)
  if (!db)
    return route ? undefined : []

  // Project only the columns actually needed. markdown is by far the largest
  // column, so meta-only consumers shouldn't pay to transfer it across the wire.
  const cols = includeMarkdown
    ? '*'
    : 'route, title, description, headings, keywords, updated_at, is_error, locale'

  // Single page lookup
  if (route) {
    const row = await db.first<PageRow>(`SELECT ${cols} FROM ai_ready_pages WHERE route = ?`, [route])
    if (!row)
      return undefined
    return includeMarkdown ? rowToData(row) : rowToEntry(row)
  }

  // Build query. A deterministic order keeps concurrent runs and offset
  // pagination stable when SQLite would otherwise return rows in scan order.
  const { sql: whereClause, params } = buildWhereClause(where)
  let sql = `SELECT ${cols} FROM ai_ready_pages ${whereClause} ORDER BY route`

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
  let lastRoute: string | undefined

  // Keyset (cursor) pagination on the route index. `OFFSET` re-scans from the
  // start on every page, so it degrades to O(N) across a large table.
  while (true) {
    const where = `WHERE is_error = 0${lastRoute ? ' AND route > ?' : ''}`
    const rows = await db.all<PageRow>(
      `SELECT * FROM ai_ready_pages ${where} ORDER BY route LIMIT ?`,
      lastRoute ? [lastRoute, batchSize] : [batchSize],
    )

    if (rows.length === 0)
      break

    for (const row of rows) {
      yield rowToData(row)
    }

    if (rows.length < batchSize)
      break

    lastRoute = rows[rows.length - 1]!.route
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
  const row = await db.first<{ count: DatabaseNumber }>(
    `SELECT COUNT(*) as count FROM ai_ready_pages ${whereClause}`,
    params,
  )
  return toNumber(row?.count)
}

// ============================================================================
// Full-text Search
// ============================================================================

export interface SearchPagesOptions {
  limit?: number
}

/**
 * Full-text search using FTS5 or PostgreSQL ILIKE
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

  if (db.dialect === 'postgres') {
    const searchTerm = `%${sanitized}%`
    return db.all<SearchResult>(`
      SELECT route, title, description, 0 AS score
      FROM ai_ready_pages
      WHERE is_error = 0
        AND (title ILIKE ? OR description ILIKE ? OR markdown ILIKE ? OR headings ILIKE ?)
      ORDER BY route
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, searchTerm, limit])
  }

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
  locale?: string
}

/**
 * Insert or update a page
 */
export async function upsertPage(event: H3Event | undefined, page: UpsertPageInput): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  const route = normalizeRoute(page.route)
  const routeKey = normalizeRouteKey(route)
  const keywordsJson = JSON.stringify(page.keywords)
  const indexedAt = Date.now()
  const source = page.source || 'runtime'
  const lastSeenAt = source === 'runtime' ? indexedAt : null
  const locale = deriveLocale(event, route, page.locale)

  await db.exec(`
    INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at, locale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      indexed = excluded.indexed,
      source = excluded.source,
      last_seen_at = excluded.last_seen_at,
      locale = excluded.locale
  `, [route, routeKey, page.title, page.description, page.markdown, page.headings, keywordsJson, page.contentHash || null, page.updatedAt, indexedAt, page.isError ? 1 : 0, page.isError ? 0 : 1, source, lastSeenAt, locale])
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

  const row = await db.first<{ indexed_at: DatabaseNumber }>('SELECT indexed_at FROM ai_ready_pages WHERE route = ?', [route])
  if (!row)
    return false
  const age = (Date.now() - toNumber(row.indexed_at)) / 1000
  return age < ttlSeconds
}

export interface PageIndexState {
  indexedAt: number
  contentHash: string | null
}

interface PageIndexStateRow {
  indexed_at: DatabaseNumber
  content_hash: string | null
}

/**
 * Fetch a page's index bookkeeping in one lightweight query.
 * Combines the freshness, existence, and prior-hash lookups that the indexing
 * hot path needs into a single indexed row read (avoids `SELECT *` and two
 * extra round-trips per page).
 */
export async function getPageIndexState(
  event: H3Event | undefined,
  route: string,
): Promise<PageIndexState | undefined> {
  const db = await getDb(event)
  if (!db)
    return undefined

  const row = await db.first<PageIndexStateRow>(
    'SELECT indexed_at, content_hash FROM ai_ready_pages WHERE route = ?',
    [route],
  )
  return row
    ? { indexedAt: toNumber(row.indexed_at), contentHash: row.content_hash }
    : undefined
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

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size)
    result.push(items.slice(i, i + size))
  return result
}

/**
 * Seed routes from sitemap (insert with indexed=0 if not exists)
 */
export async function seedRoutes(event: H3Event | undefined, routes: Array<string | { route: string, locale?: string }>): Promise<number> {
  const db = await getDb(event)
  if (!db || routes.length === 0)
    return 0

  const now = new Date().toISOString()
  const nowMs = Date.now()

  // Resolve + dedupe rows up front (pure, no IO). Deduping by route avoids
  // SQLite's "ON CONFLICT cannot affect row a second time" error when a
  // multi-row INSERT contains the same route twice.
  const byRoute = new Map<string, { route: string, routeKey: string, locale: string }>()
  for (const entry of routes) {
    // Canonicalise before keying the map: '' and '/' are one page, so leaving
    // them distinct here defeats the dedupe and collides on route_key instead.
    const route = normalizeRoute(typeof entry === 'string' ? entry : entry.route)
    const explicitLocale = typeof entry === 'string' ? undefined : entry.locale
    byRoute.set(route, {
      route,
      routeKey: normalizeRouteKey(route),
      locale: deriveLocale(event, route, explicitLocale),
    })
  }

  // Batch into multi-row INSERTs. Each statement is a DB round-trip (a network
  // call on D1), so one INSERT per route times out large sitemaps. 5 bind
  // params per row keeps each statement within D1's 100-parameter cap. The
  // statements then go through `db.batch` so all round-trips collapse into one
  // driver-level batch request.
  const ROWS_PER_INSERT = 20
  const stmts: { sql: string, params: unknown[] }[] = []
  for (const batch of chunk([...byRoute.values()], ROWS_PER_INSERT)) {
    const valuesSql = batch.map(() => `(?, ?, '', '', '', '[]', '[]', ?, 0, 0, 0, 'runtime', ?, ?)`).join(', ')
    const params = batch.flatMap(r => [r.route, r.routeKey, now, nowMs, r.locale])
    stmts.push({
      sql: `
        INSERT INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at, locale)
        VALUES ${valuesSql}
        ON CONFLICT(route) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          locale = excluded.locale,
          is_error = 0,
          indexed = CASE WHEN ai_ready_pages.is_error = 1 THEN 0 ELSE ai_ready_pages.indexed END
      `,
      params,
    })
  }
  await db.batch(stmts)
  return byRoute.size
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

  await db.exec(`
    INSERT INTO _ai_ready_info (id, value) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET value = excluded.value
  `, ['sitemap_seeded_at', String(timestamp)])
}

/**
 * Prune routes not seen in sitemap for longer than threshold
 * Only prunes routes with source='runtime' (never prerendered pages)
 */
export async function pruneStaleRoutes(
  event: H3Event | undefined,
  staleThresholdSeconds: number,
  protectedSince?: number,
): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const staleThreshold = Date.now() - (staleThresholdSeconds * 1000)
  const threshold = protectedSince === undefined
    ? staleThreshold
    : Math.min(staleThreshold, protectedSince)

  const countRow = await db.first<{ count: DatabaseNumber }>(
    'SELECT COUNT(*) as count FROM ai_ready_pages WHERE source = ? AND last_seen_at < ?',
    ['runtime', threshold],
  )
  const count = toNumber(countRow?.count)

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
// Cron Run Logging
// ============================================================================

export interface CronRunRow {
  id: number
  started_at: DatabaseNumber
  finished_at: DatabaseNumber | null
  duration_ms: DatabaseNumber | null
  pages_indexed: DatabaseNumber
  pages_remaining: DatabaseNumber
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
  errors: string[]
  status: 'running' | 'success' | 'partial' | 'error'
}

function rowToCronRun(row: CronRunRow): CronRun {
  return {
    id: row.id,
    startedAt: toNumber(row.started_at),
    finishedAt: toNullableNumber(row.finished_at),
    durationMs: toNullableNumber(row.duration_ms),
    pagesIndexed: toNumber(row.pages_indexed),
    pagesRemaining: toNumber(row.pages_remaining),
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
  const row = await db.first<{ id: DatabaseNumber }>(
    'INSERT INTO ai_ready_cron_runs (started_at, status) VALUES (?, ?) RETURNING id',
    [now, 'running'],
  )
  return row ? toNumber(row.id) : null
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
    errors: string[]
  },
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  const now = Date.now()
  const row = await db.first<{ started_at: DatabaseNumber }>('SELECT started_at FROM ai_ready_cron_runs WHERE id = ?', [runId])
  const durationMs = row ? now - toNumber(row.started_at) : null

  const status = result.errors.length > 0
    ? (result.pagesIndexed > 0 ? 'partial' : 'error')
    : 'success'

  await db.exec(`
    UPDATE ai_ready_cron_runs SET
      finished_at = ?,
      duration_ms = ?,
      pages_indexed = ?,
      pages_remaining = ?,
      errors = ?,
      status = ?
    WHERE id = ?
  `, [now, durationMs, result.pagesIndexed, result.pagesRemaining, JSON.stringify(result.errors), status, runId])
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

  const countRow = await db.first<{ count: DatabaseNumber }>('SELECT COUNT(*) as count FROM ai_ready_cron_runs')
  const total = toNumber(countRow?.count)

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

  const countRow = await db.first<{ count: DatabaseNumber }>(
    'SELECT COUNT(*) as count FROM ai_ready_cron_runs WHERE started_at < ?',
    [threshold],
  )
  const count = toNumber(countRow?.count)

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
  lastStaleCheck: number | null
  buildId: string | null
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
    total_pages: DatabaseNumber
    pending_pages: DatabaseNumber
    last_stale_check: string | null
    build_id: string | null
    sitemaps_need_crawl: DatabaseNumber
  }>(`
    SELECT
      (SELECT COUNT(*) FROM ai_ready_pages) as total_pages,
      (SELECT COUNT(*) FROM ai_ready_pages WHERE indexed = 0 AND is_error = 0) as pending_pages,
      (SELECT value FROM _ai_ready_info WHERE id = 'last_stale_check') as last_stale_check,
      (SELECT value FROM _ai_ready_info WHERE id = 'build_id') as build_id,
      (SELECT COUNT(*) FROM ai_ready_sitemaps WHERE (crawl_state IS NOT NULL OR last_crawled_at IS NULL OR last_crawled_at < ?) AND error_count < 10) as sitemaps_need_crawl
  `, [sitemapThreshold])

  if (!row)
    return null

  return {
    totalPages: toNumber(row.total_pages),
    pendingPages: toNumber(row.pending_pages),
    lastStaleCheck: row.last_stale_check ? Number.parseInt(row.last_stale_check, 10) : null,
    buildId: row.build_id,
    sitemapsNeedCrawl: toNumber(row.sitemaps_need_crawl),
  }
}

// ============================================================================
// Cron Lock (prevent overlapping runs)
// ============================================================================

const CRON_LOCK_TTL_MS = 300_000 // 5 minutes - stale lock threshold (matches cron interval)

export type CronLockAcquire
  = | { _tag: 'acquired', token: string }
    | { _tag: 'held' }

interface CronLockRecord {
  acquiredAt: number
  expiresAt: number
}

function cronLockField(db: RawExecutor, column: string, key: 't' | 'a' | 'e'): string {
  return db.dialect === 'postgres'
    ? `(${column}::jsonb ->> '${key}')`
    : `json_extract(${column}, '$.${key}')`
}

/**
 * Try to acquire cron lock. Returns the ownership token on success, `held`
 * when a live lock belongs to another run.
 *
 * The value carries a random token plus expiry in one row, so the
 * compare-expired-then-set upsert is atomic and ownership is unique even for
 * two isolates that start in the same millisecond. A legacy value that
 * predates tokens parses as no expiry, so it is treated as expired.
 */
export async function tryAcquireCronLock(event: H3Event | undefined): Promise<CronLockAcquire> {
  const token = randomUUID()
  const db = await getDb(event)
  if (!db)
    return { _tag: 'acquired', token }

  const now = Date.now()
  const value = JSON.stringify({ t: token, a: now, e: now + CRON_LOCK_TTL_MS })

  await db.exec(`
    INSERT INTO _ai_ready_info (id, value) VALUES ('cron_lock', ?)
    ON CONFLICT(id) DO UPDATE SET value = excluded.value
    WHERE CAST(coalesce(${cronLockField(db, '_ai_ready_info.value', 'e')}, '0') AS BIGINT) < ?
  `, [value, now])

  const row = await db.first<{ value: string }>(
    `SELECT value FROM _ai_ready_info WHERE id = 'cron_lock' AND ${cronLockField(db, 'value', 't')} = ?`,
    [token],
  )
  return row ? { _tag: 'acquired', token } : { _tag: 'held' }
}

/**
 * Release cron lock. Only deletes the row when its token is ours, so a run
 * that outlived the lock TTL cannot delete the new owner's lock.
 */
export async function releaseCronLock(event: H3Event | undefined, token: string): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec(`DELETE FROM _ai_ready_info WHERE id = 'cron_lock' AND ${cronLockField(db, 'value', 't')} = ?`, [token])
}

export interface CronLockStatus {
  held: boolean
  since: number | null
  elapsedMs: number | null
  stale: boolean
}

const RE_CRON_LOCK_NUMERIC = /^\d+$/

function parseCronLockValue(value: string): CronLockRecord | null {
  if (RE_CRON_LOCK_NUMERIC.test(value))
    return { acquiredAt: Number(value), expiresAt: Number(value) + CRON_LOCK_TTL_MS }
  const parsed = safeJsonParse<{ a?: unknown, e?: unknown } | null>(value, null)
  if (parsed && typeof parsed === 'object' && typeof parsed.a === 'number' && typeof parsed.e === 'number')
    return { acquiredAt: parsed.a, expiresAt: parsed.e }
  return null
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

  const record = parseCronLockValue(row.value)
  if (!record)
    return { held: false, since: null, elapsedMs: null, stale: false }

  const now = Date.now()
  const stale = now >= record.expiresAt

  return {
    held: !stale,
    since: record.acquiredAt,
    elapsedMs: now - record.acquiredAt,
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
  crawlState: SitemapCrawlState | null
}

export interface SitemapStatusEntry extends Omit<SitemapEntry, 'crawlState'> {
  continuing: boolean
}

interface SitemapRow {
  name: string
  route: string
  last_crawled_at: DatabaseNumber | null
  url_count: DatabaseNumber
  error_count: DatabaseNumber
  last_error: string | null
  crawl_state: string | null
}

function rowToSitemapEntry(row: SitemapRow): SitemapEntry {
  const parsedState = parseSitemapCrawlState(row.crawl_state)
  if (parsedState._tag === 'error')
    throw new Error(`Invalid crawl state for sitemap ${row.name}: ${parsedState.error}`)

  return {
    name: row.name,
    route: row.route,
    lastCrawledAt: toNullableNumber(row.last_crawled_at),
    urlCount: toNumber(row.url_count),
    errorCount: toNumber(row.error_count),
    lastError: row.last_error,
    crawlState: parsedState.state,
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

  const existingRows = await db.all<{ name: string, route: string }>('SELECT name, route FROM ai_ready_sitemaps')
  const existingNames = new Set(existingRows.map(r => r.name))
  const existingRoutes = new Map(existingRows.map(row => [row.name, row.route]))
  const configNames = new Set(sitemaps.map(s => s.name))

  let added = 0
  let removed = 0

  const stmts: { sql: string, params: unknown[] }[] = []

  // Insert new sitemaps
  for (const sitemap of sitemaps) {
    if (!existingNames.has(sitemap.name)) {
      stmts.push({
        sql: 'INSERT INTO ai_ready_sitemaps (name, route) VALUES (?, ?)',
        params: [sitemap.name, sitemap.route],
      })
      added++
    }
    else if (existingRoutes.get(sitemap.name) !== sitemap.route) {
      await db.exec(`
        UPDATE ai_ready_sitemaps SET
          route = ?,
          last_crawled_at = NULL,
          url_count = 0,
          error_count = 0,
          last_error = NULL,
          crawl_state = NULL
        WHERE name = ?
      `, [sitemap.route, sitemap.name])
    }
  }

  // Remove sitemaps no longer in config
  for (const name of existingNames) {
    if (!configNames.has(name)) {
      stmts.push({
        sql: 'DELETE FROM ai_ready_sitemaps WHERE name = ?',
        params: [name],
      })
      removed++
    }
  }

  await db.batch(stmts)

  return { added, removed }
}

/**
 * Get next sitemap to crawl
 * Prioritizes: in-progress continuations, errors, then oldest crawled
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

  // Continuations bypass the normal recrawl interval. They are already bounded
  // to one round per cron run, and delaying them could allow pruning against an
  // incomplete traversal.
  const continuationRow = await db.first<SitemapRow>(`
    SELECT * FROM ai_ready_sitemaps
    WHERE crawl_state IS NOT NULL AND error_count = 0
    ORDER BY last_crawled_at ASC NULLS FIRST
    LIMIT 1
  `)
  if (continuationRow)
    return rowToSitemapEntry(continuationRow)

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
 * Get the last crawl timestamp for a single sitemap. Used to throttle runtime
 * re-seeding (the sitemap:resolved hook fires on every sitemap request).
 * Returns null when the sitemap row doesn't exist yet.
 */
export async function getSitemapLastCrawledAt(
  event: H3Event | undefined,
  name: string,
): Promise<number | null> {
  const db = await getDb(event)
  if (!db)
    return null

  const row = await db.first<{ last_crawled_at: DatabaseNumber | null }>(
    'SELECT last_crawled_at FROM ai_ready_sitemaps WHERE name = ?',
    [name],
  )
  return toNullableNumber(row?.last_crawled_at)
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
      last_error = NULL,
      crawl_state = NULL
    WHERE name = ?
  `, [Date.now(), urlCount, name])
}

/**
 * Record a sitemap:resolved hook seed only while no durable crawl is active.
 * The hook may finish in waitUntil after cron has persisted a continuation.
 */
export async function markSitemapSeeded(
  event: H3Event | undefined,
  name: string,
  urlCount: number,
  expectedLastCrawledAt: number | null,
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  const expectedClause = expectedLastCrawledAt === null
    ? 'last_crawled_at IS NULL'
    : 'last_crawled_at = ?'
  const expectedParams = expectedLastCrawledAt === null ? [] : [expectedLastCrawledAt]

  await db.exec(`
    UPDATE ai_ready_sitemaps SET
      last_crawled_at = ?,
      url_count = ?,
      error_count = 0,
      last_error = NULL
    WHERE name = ?
      AND crawl_state IS NULL
      AND error_count = 0
      AND ${expectedClause}
  `, [Date.now(), urlCount, name, ...expectedParams])
}

/** Persist a resumable sitemap crawl without incrementing its error budget. */
export async function markSitemapCrawlPartial(
  event: H3Event | undefined,
  name: string,
  state: SitemapCrawlState,
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  await db.exec(`
    UPDATE ai_ready_sitemaps SET
      last_crawled_at = ?,
      url_count = ?,
      error_count = 0,
      last_error = NULL,
      crawl_state = ?
    WHERE name = ?
  `, [Date.now(), state.urlsObserved, serializeSitemapCrawlState(state), name])
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
      last_error = ?,
      crawl_state = NULL
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

  const countRow = await db.first<{ count: DatabaseNumber }>(
    'SELECT COUNT(*) as count FROM ai_ready_sitemaps WHERE error_count > 0 OR crawl_state IS NOT NULL',
  )
  const count = toNumber(countRow?.count)

  if (count > 0) {
    await db.exec('UPDATE ai_ready_sitemaps SET error_count = 0, last_error = NULL, last_crawled_at = NULL, crawl_state = NULL')
  }

  return count
}

/**
 * Get all sitemaps with their status
 */
export async function getSitemapStatus(
  event: H3Event | undefined,
): Promise<SitemapStatusEntry[]> {
  const db = await getDb(event)
  if (!db)
    return []

  const rows = await db.all<SitemapRow>('SELECT * FROM ai_ready_sitemaps ORDER BY name')
  return rows.map((row) => {
    const { crawlState, ...entry } = rowToSitemapEntry(row)
    return { ...entry, continuing: crawlState !== null }
  })
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

  const rows = await db.all<{ route: string, title: string, indexed_at: DatabaseNumber }>(
    'SELECT route, title, indexed_at FROM ai_ready_pages WHERE indexed = 1 AND is_error = 0 ORDER BY indexed_at DESC LIMIT ?',
    [limit],
  )
  return rows.map(r => ({ route: r.route, title: r.title, indexedAt: toNumber(r.indexed_at) }))
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
  const row = await db.first<{ count: DatabaseNumber }>(
    'SELECT COUNT(*) as count FROM ai_ready_pages WHERE indexed = 1 AND indexed_at > ?',
    [threshold],
  )
  return toNumber(row?.count)
}
