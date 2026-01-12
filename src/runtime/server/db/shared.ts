// Shared database utilities for build-time and runtime
import type { Connector } from 'db0'
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
}

/**
 * Create a DatabaseAdapter from a db0 Connector
 */
export function createAdapter(connector: Connector): DatabaseAdapter {
  return {
    all: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const result = await connector.prepare(sql).all(...(params as never[]))
      return (result || []) as T[]
    },
    first: async <T>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
      return connector.prepare(sql).get(...(params as never[])) as T | undefined
    },
    exec: async (sql: string, params: unknown[] = []): Promise<void> => {
      await connector.prepare(sql).run(...(params as never[]))
    },
  }
}

/**
 * Initialize database schema with version checking
 */
export async function initSchema(db: DatabaseAdapter): Promise<void> {
  const needsRebuild = await checkSchemaVersion(db)

  if (needsRebuild) {
    for (const sql of DROP_TABLES_SQL) {
      await db.exec(sql)
    }
  }

  for (const sql of ALL_SCHEMA_SQL) {
    await db.exec(sql)
  }

  await db.exec(
    'INSERT OR REPLACE INTO _ai_ready_info (id, version) VALUES (?, ?)',
    ['schema', SCHEMA_VERSION],
  )
}

async function checkSchemaVersion(db: DatabaseAdapter): Promise<boolean> {
  const info = await db.first<{ version: string }>(
    'SELECT version FROM _ai_ready_info WHERE id = ?',
    ['schema'],
  ).catch(() => null)

  return !info || info.version !== SCHEMA_VERSION
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

/**
 * Query all pages from database
 */
export async function queryAllPages(db: DatabaseAdapter, options?: { includeErrors?: boolean }): Promise<PageOutput[]> {
  const where = options?.includeErrors ? '' : 'WHERE is_error = 0'
  const rows = await db.all<PageRow>(`SELECT route, title, description, markdown, headings, keywords, content_hash, updated_at, is_error FROM ai_ready_pages ${where}`)

  return rows.map(row => ({
    route: row.route,
    title: row.title,
    description: row.description,
    markdown: row.markdown,
    headings: row.headings,
    keywords: JSON.parse(row.keywords || '[]'),
    contentHash: row.content_hash || undefined,
    updatedAt: row.updated_at,
    isError: row.is_error === 1,
  }))
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
}

/**
 * Export database as compressed dump (base64 gzip)
 */
export async function exportDbDump(db: DatabaseAdapter): Promise<string> {
  const rows = await db.all<DumpRow>(`
    SELECT route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at
    FROM ai_ready_pages
  `)
  return compressToBase64(rows)
}

/**
 * Import dump into database
 */
export async function importDbDump(db: DatabaseAdapter, rows: DumpRow[]): Promise<void> {
  for (const row of rows) {
    const source = row.source || 'prerender'
    await db.exec(`
      INSERT OR REPLACE INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, content_hash, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)
    `, [row.route, row.route_key, row.title, row.description, row.markdown, row.headings, row.keywords, row.content_hash || null, row.updated_at, row.indexed_at, row.is_error, source])
  }
}
