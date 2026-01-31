// Shared database utilities for build-time and runtime
import { subtle } from 'uncrypto'
import { ALL_SCHEMA_SQL, DROP_TABLES_SQL, SCHEMA_VERSION } from './schema-sql'

/**
 * Compute content hash for change detection (first 16 chars of SHA-256)
 */
export async function computeContentHash(markdown: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(markdown)
  const hashBuffer = await subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export interface DatabaseAdapter {
  all: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  first: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>
  exec: (sql: string, params?: unknown[]) => Promise<void>
  close?: () => Promise<void>
}

/**
 * Initialize database schema with version checking
 * Skips if schema is already at current version
 */
export async function initSchema(db: DatabaseAdapter): Promise<void> {
  const currentVersion = await getSchemaVersion(db)

  // Skip if already initialized with current version
  if (currentVersion === SCHEMA_VERSION)
    return

  // Drop and rebuild if version mismatch (migration)
  if (currentVersion && currentVersion !== SCHEMA_VERSION) {
    for (const sql of DROP_TABLES_SQL) {
      await db.exec(sql)
    }
  }

  // Create all tables/indexes
  for (const sql of ALL_SCHEMA_SQL) {
    await db.exec(sql)
  }

  await db.exec(
    'INSERT OR REPLACE INTO _ai_ready_info (id, version) VALUES (?, ?)',
    ['schema', SCHEMA_VERSION],
  )
}

async function getSchemaVersion(db: DatabaseAdapter): Promise<string | null> {
  const info = await db.first<{ version: string }>(
    'SELECT version FROM _ai_ready_info WHERE id = ?',
    ['schema'],
  ).catch(() => null)

  return info?.version || null
}

/**
 * Normalize route to storage key format
 * e.g., '/about/team' -> 'about:team', '/' -> 'index'
 */
export function normalizeRouteKey(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, ':') || 'index'
}

/**
 * Compress data to base64 gzip
 */
export async function compressToBase64(data: unknown): Promise<string> {
  const json = JSON.stringify(data)
  const encoder = new TextEncoder()
  const stream = new Blob([encoder.encode(json)]).stream()
  const compressed = stream.pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(compressed).arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

/**
 * Decompress from base64 gzip
 */
export async function decompressFromBase64<T>(base64: string): Promise<T> {
  const buffer = Buffer.from(base64, 'base64')
  const stream = new Blob([buffer]).stream()
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(decompressed).text()
  return JSON.parse(text)
}

// ============================================================================
// Page Operations
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
  contentHash?: string
  updatedAt: string
  isError: boolean
}

interface PageRow {
  route: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string
  content_hash: string | null
  updated_at: string
  is_error: number
}

/**
 * Insert or update a page
 */
export async function insertPage(db: DatabaseAdapter, page: PageInput): Promise<void> {
  const now = Date.now()
  const source = page.source || 'prerender'
  await db.exec(`
    INSERT OR REPLACE INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    page.route,
    normalizeRouteKey(page.route),
    page.title,
    page.description,
    page.markdown,
    page.headings,
    JSON.stringify(page.keywords),
    page.contentHash || null,
    page.updatedAt,
    now,
    page.isError ? 1 : 0,
    page.isError ? 0 : 1,
    source,
    now,
  ])
}

export interface QueryAllPagesOptions {
  includeErrors?: boolean
  excludeMarkdown?: boolean
}

/**
 * Query all pages from database
 * @param db - Database adapter
 * @param options - Query options
 * @param options.excludeMarkdown - If true, omit markdown field to reduce memory usage
 */
export async function queryAllPages(db: DatabaseAdapter, options?: QueryAllPagesOptions & { excludeMarkdown: true }): Promise<PageMetaOutput[]>
export async function queryAllPages(db: DatabaseAdapter, options?: QueryAllPagesOptions & { excludeMarkdown?: false }): Promise<PageOutput[]>
export async function queryAllPages(db: DatabaseAdapter, options?: QueryAllPagesOptions): Promise<PageOutput[] | PageMetaOutput[]>
export async function queryAllPages(db: DatabaseAdapter, options?: QueryAllPagesOptions): Promise<PageOutput[] | PageMetaOutput[]> {
  const where = options?.includeErrors ? '' : 'WHERE is_error = 0'
  const fields = options?.excludeMarkdown
    ? 'route, title, description, headings, keywords, content_hash, updated_at, is_error'
    : 'route, title, description, markdown, headings, keywords, content_hash, updated_at, is_error'
  const rows = await db.all<PageRow>(`SELECT ${fields} FROM ai_ready_pages ${where}`)

  return rows.map(row => ({
    route: row.route,
    title: row.title,
    description: row.description,
    ...(options?.excludeMarkdown ? {} : { markdown: row.markdown }),
    headings: row.headings,
    keywords: JSON.parse(row.keywords || '[]'),
    contentHash: row.content_hash || undefined,
    updatedAt: row.updated_at,
    isError: row.is_error === 1,
  })) as PageOutput[] | PageMetaOutput[]
}

export interface DumpRow {
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
  source: string
  last_seen_at: number | null
  indexnow_synced_at: number | null
}

const DUMP_BATCH_SIZE = 500

/**
 * Export database as compressed dump (base64 gzip) using batched streaming
 * Processes rows in batches to avoid loading entire database into memory
 */
export async function exportDbDump(db: DatabaseAdapter): Promise<string> {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []

  // Create compression stream
  const compressionStream = new CompressionStream('gzip')
  const writer = compressionStream.writable.getWriter()

  // Collect compressed output
  const reader = compressionStream.readable.getReader()
  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      chunks.push(value)
    }
  })()

  // Stream rows in batches
  await writer.write(encoder.encode('['))
  let offset = 0
  let first = true

  while (true) {
    const rows = await db.all<DumpRow>(`
      SELECT route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at, indexnow_synced_at
      FROM ai_ready_pages
      ORDER BY route
      LIMIT ${DUMP_BATCH_SIZE} OFFSET ${offset}
    `)

    if (rows.length === 0)
      break

    for (const row of rows) {
      const prefix = first ? '' : ','
      first = false
      await writer.write(encoder.encode(prefix + JSON.stringify(row)))
    }

    if (rows.length < DUMP_BATCH_SIZE)
      break
    offset += DUMP_BATCH_SIZE
  }

  await writer.write(encoder.encode(']'))
  await writer.close()
  await readPromise

  // Combine chunks and convert to base64
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return Buffer.from(result).toString('base64')
}

/**
 * Import dump into database
 * Sets indexed=1, last_seen_at=indexed_at, indexnow_synced_at=indexed_at
 * (pages from dump were already indexed and synced during build, no need to re-notify)
 */
export async function importDbDump(db: DatabaseAdapter, rows: DumpRow[]): Promise<void> {
  for (const row of rows) {
    const source = row.source || 'prerender'
    await db.exec(`
      INSERT OR REPLACE INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at, indexnow_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `, [row.route, row.route_key, row.title, row.description, row.markdown, row.headings, row.keywords, row.content_hash || null, row.updated_at, row.indexed_at, row.is_error, source, row.indexed_at, row.indexed_at])
  }
}
