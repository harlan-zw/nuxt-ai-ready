import { ALL_SCHEMA_SQL, DROP_TABLES_SQL, SCHEMA_VERSION } from '../../../shared/schema'

export { SCHEMA_VERSION }

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

  // Execute each statement separately
  for (const statement of ALL_SCHEMA_SQL) {
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
