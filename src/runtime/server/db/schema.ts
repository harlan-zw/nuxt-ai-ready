export const SCHEMA_VERSION = 'v1.2.0'

const DROP_TABLES_SQL = [
  'DROP TABLE IF EXISTS ai_ready_pages_fts',
  'DROP TABLE IF EXISTS ai_ready_pages',
  'DROP TABLE IF EXISTS _ai_ready_info',
  // Legacy unprefixed tables (migration from v1.0.0)
  'DROP TABLE IF EXISTS pages_fts',
  'DROP TABLE IF EXISTS pages',
]

export const createTablesSQL = `
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
  indexed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_route ON ai_ready_pages(route);
CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_is_error ON ai_ready_pages(is_error);

CREATE VIRTUAL TABLE IF NOT EXISTS ai_ready_pages_fts USING fts5(
  route, title, description, markdown, headings, keywords,
  content=ai_ready_pages, content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ai AFTER INSERT ON ai_ready_pages BEGIN
  INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
  VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS ai_ready_pages_ad AFTER DELETE ON ai_ready_pages BEGIN
  INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
  VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS ai_ready_pages_au AFTER UPDATE ON ai_ready_pages BEGIN
  INSERT INTO ai_ready_pages_fts(ai_ready_pages_fts, rowid, route, title, description, markdown, headings, keywords)
  VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
  INSERT INTO ai_ready_pages_fts(rowid, route, title, description, markdown, headings, keywords)
  VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
END;

CREATE TABLE IF NOT EXISTS _ai_ready_info (
  id TEXT PRIMARY KEY,
  value TEXT,
  version TEXT,
  checksum TEXT,
  ready INTEGER DEFAULT 0
);
`

export interface DatabaseAdapter {
  all: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  first: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>
  exec: (sql: string, params?: unknown[]) => Promise<void>
}

export async function initSchema(db: DatabaseAdapter): Promise<void> {
  // Check existing schema version
  const needsRebuild = await checkSchemaVersion(db)

  if (needsRebuild) {
    for (const sql of DROP_TABLES_SQL) {
      await db.exec(sql)
    }
  }

  // Execute each statement separately - split carefully to avoid breaking triggers
  const statements = [
    // Main table
    `CREATE TABLE IF NOT EXISTS ai_ready_pages (
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
      indexed INTEGER NOT NULL DEFAULT 0
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_route ON ai_ready_pages(route)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_is_error ON ai_ready_pages(is_error)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_ready_pages_indexed ON ai_ready_pages(indexed)`,
    // FTS5 virtual table
    `CREATE VIRTUAL TABLE IF NOT EXISTS ai_ready_pages_fts USING fts5(
      route, title, description, markdown, headings, keywords,
      content=ai_ready_pages, content_rowid=id
    )`,
    // Triggers for FTS sync
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
    // Info table - generic key-value store for metadata
    `CREATE TABLE IF NOT EXISTS _ai_ready_info (
      id TEXT PRIMARY KEY,
      value TEXT,
      version TEXT,
      checksum TEXT,
      ready INTEGER DEFAULT 0
    )`,
  ]

  for (const statement of statements) {
    await db.exec(statement)
  }

  // Store current schema version
  await db.exec(
    'INSERT OR REPLACE INTO _ai_ready_info (id, version) VALUES (?, ?)',
    ['schema', SCHEMA_VERSION],
  )
}

async function checkSchemaVersion(db: DatabaseAdapter): Promise<boolean> {
  // Check if info table exists and has version
  const info = await db.first<{ version: string }>(
    'SELECT version FROM _ai_ready_info WHERE id = ?',
    ['schema'],
  ).catch(() => null)

  // Rebuild if no version or version mismatch
  return !info || info.version !== SCHEMA_VERSION
}
