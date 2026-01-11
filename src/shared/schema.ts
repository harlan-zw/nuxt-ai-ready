// Shared schema definitions for build-time and runtime
// Used by both better-sqlite3 (prerender) and db0 (runtime)

export const SCHEMA_VERSION = 'v1.4.0'

export const PAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ai_ready_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT UNIQUE NOT NULL,
  route_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  headings TEXT NOT NULL DEFAULT '[]',
  keywords TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  indexed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'prerender',
  last_seen_at INTEGER
)`

export const PAGES_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_route ON ai_ready_pages(route)',
  'CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_is_error ON ai_ready_pages(is_error)',
  'CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexed ON ai_ready_pages(indexed)',
  'CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_source ON ai_ready_pages(source)',
  'CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_last_seen ON ai_ready_pages(last_seen_at)',
]

export const FTS_TABLE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS ai_ready_pages_fts USING fts5(
  route, title, description, markdown, headings, keywords,
  content=ai_ready_pages, content_rowid=id
)`

export const FTS_TRIGGERS_SQL = [
  `CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ai AFTER INSERT ON ai_ready_pages BEGIN
    INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
    VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
  END`,
  `CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ad AFTER DELETE ON ai_ready_pages BEGIN
    INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
    VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
  END`,
  `CREATE TRIGGER IF NOT EXISTS ai_ready_pages_au AFTER UPDATE ON ai_ready_pages BEGIN
    INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
    VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
    INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
    VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
  END`,
]

export const INFO_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS _ai_ready_info (
  id TEXT PRIMARY KEY,
  value TEXT,
  version TEXT,
  checksum TEXT,
  ready INTEGER DEFAULT 0
)`

export const DROP_TABLES_SQL = [
  'DROP TABLE IF EXISTS ai_ready_pages_fts',
  'DROP TABLE IF EXISTS ai_ready_pages',
  'DROP TABLE IF EXISTS _ai_ready_info',
  // Legacy unprefixed tables (migration from v1.0.0)
  'DROP TABLE IF EXISTS pages_fts',
  'DROP TABLE IF EXISTS pages',
]

// All schema statements in order
export const ALL_SCHEMA_SQL = [
  PAGES_TABLE_SQL,
  ...PAGES_INDEXES_SQL,
  FTS_TABLE_SQL,
  ...FTS_TRIGGERS_SQL,
  INFO_TABLE_SQL,
]
