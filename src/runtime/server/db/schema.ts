export const SCHEMA_VERSION = 'v1.0.0'

const DROP_TABLES_SQL = [
  'DROP TABLE IF EXISTS pages_fts',
  'DROP TABLE IF EXISTS pages',
  'DROP TABLE IF EXISTS _ai_ready_info',
]

export const createTablesSQL = `
CREATE TABLE IF NOT EXISTS pages (
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
  is_error INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pages_route ON pages(route);
CREATE INDEX IF NOT EXISTS idx_pages_is_error ON pages(is_error);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  route, title, description, markdown, headings, keywords,
  content=pages, content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, route, title, description, markdown, headings, keywords)
  VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, route, title, description, markdown, headings, keywords)
  VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, route, title, description, markdown, headings, keywords)
  VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
  INSERT INTO pages_fts(rowid, route, title, description, markdown, headings, keywords)
  VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
END;

CREATE TABLE IF NOT EXISTS _ai_ready_info (
  id TEXT PRIMARY KEY,
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
    `CREATE TABLE IF NOT EXISTS pages (
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
      is_error INTEGER NOT NULL DEFAULT 0
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_pages_route ON pages(route)`,
    `CREATE INDEX IF NOT EXISTS idx_pages_is_error ON pages(is_error)`,
    // FTS5 virtual table
    `CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      route, title, description, markdown, headings, keywords,
      content=pages, content_rowid=id
    )`,
    // Triggers for FTS sync
    `CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END`,
    `CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
    END`,
    `CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, route, title, description, markdown, headings, keywords)
      VALUES('delete', old.id, old.route, old.title, old.description, old.markdown, old.headings, old.keywords);
      INSERT INTO pages_fts(rowid, route, title, description, markdown, headings, keywords)
      VALUES (new.id, new.route, new.title, new.description, new.markdown, new.headings, new.keywords);
    END`,
    // Info table
    `CREATE TABLE IF NOT EXISTS _ai_ready_info (
      id TEXT PRIMARY KEY,
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
