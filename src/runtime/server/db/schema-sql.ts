/**
 * SQLite schema definitions for build-time prerendering
 * Used by shared.ts during nuxi generate/build
 */

export const SCHEMA_VERSION = 'v2.2.0'

/**
 * Allowed FTS5 tokenizer values. The configured value gets interpolated into the
 * `CREATE VIRTUAL TABLE … tokenize='…'` DDL, so we restrict it to a known-safe
 * set instead of escaping. Adding a new tokenizer requires extending this list.
 */
export const SUPPORTED_FTS_TOKENIZERS = [
  'unicode61 remove_diacritics 2',
  'trigram',
] as const

export type FtsTokenizer = typeof SUPPORTED_FTS_TOKENIZERS[number]

export const DEFAULT_FTS_TOKENIZER: FtsTokenizer = 'unicode61 remove_diacritics 2'

export function resolveFtsTokenizer(value: string | undefined): FtsTokenizer {
  if (!value)
    return DEFAULT_FTS_TOKENIZER
  return (SUPPORTED_FTS_TOKENIZERS as readonly string[]).includes(value)
    ? value as FtsTokenizer
    : DEFAULT_FTS_TOKENIZER
}

export interface SchemaOptions {
  /**
   * FTS5 tokenizer to use. Defaults to `unicode61 remove_diacritics 2`.
   * Use `trigram` when CJK locales are present (unicode61 fails on whitespace-less scripts).
   */
  ftsTokenizer?: string
}

export function buildSchemaSql(opts: SchemaOptions = {}): string[] {
  const tokenizer = resolveFtsTokenizer(opts.ftsTokenizer)
  return [
    // Pages table
    `CREATE TABLE IF NOT EXISTS ai_ready_pages (
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
      indexnow_synced_at INTEGER,
      locale TEXT NOT NULL DEFAULT ''
    )`,
    // Info table (schema version tracking)
    `CREATE TABLE IF NOT EXISTS _ai_ready_info (
      id TEXT PRIMARY KEY,
      value TEXT,
      version TEXT,
      checksum TEXT,
      ready INTEGER DEFAULT 0
    )`,
    // Cron runs table
    `CREATE TABLE IF NOT EXISTS ai_ready_cron_runs (
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
    // IndexNow log table
    `CREATE TABLE IF NOT EXISTS ai_ready_indexnow_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_at INTEGER NOT NULL,
      url_count INTEGER NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )`,
    // Sitemaps table
    `CREATE TABLE IF NOT EXISTS ai_ready_sitemaps (
      name TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      last_crawled_at INTEGER,
      url_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      crawl_state TEXT
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_route ON ai_ready_pages(route)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_is_error ON ai_ready_pages(is_error)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexed ON ai_ready_pages(indexed)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_source ON ai_ready_pages(source)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_last_seen ON ai_ready_pages(last_seen_at)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_locale ON ai_ready_pages(locale)`,
    // FTS5 virtual table
    `CREATE VIRTUAL TABLE IF NOT EXISTS ai_ready_pages_fts USING fts5(
      route, title, description, markdown, headings, keywords,
      content=ai_ready_pages, content_rowid=id, tokenize='${tokenizer}'
    )`,
    // FTS triggers
    `CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ai AFTER INSERT ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END`,
    `CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ad AFTER DELETE ON ai_ready_pages BEGIN
      INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
    END`,
    `CREATE TRIGGER IF NOT EXISTS ai_ready_pages_au AFTER UPDATE ON ai_ready_pages
      WHEN old.route IS NOT new.route
        OR old.title IS NOT new.title
        OR old.description IS NOT new.description
        OR old.markdown IS NOT new.markdown
        OR old.headings IS NOT new.headings
        OR old.keywords IS NOT new.keywords
      BEGIN
      INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
      INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END`,
  ]
}

export const DROP_TABLES_SQL = [
  'DROP TABLE IF EXISTS ai_ready_pages_fts',
  'DROP TABLE IF EXISTS ai_ready_pages',
  'DROP TABLE IF EXISTS _ai_ready_info',
  'DROP TABLE IF EXISTS ai_ready_cron_runs',
  'DROP TABLE IF EXISTS ai_ready_indexnow_log',
  'DROP TABLE IF EXISTS ai_ready_sitemaps',
]
