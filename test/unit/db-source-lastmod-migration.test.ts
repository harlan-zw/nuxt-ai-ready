import type { H3Event } from 'h3'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initSchema } from '../../src/runtime/server/db/drizzle/queries'
import { registerDriver } from '../../src/runtime/server/db/drizzle/raw'

vi.mock('#nuxtseo/nitro', () => ({ useRuntimeConfig: () => ({}) }))

describe('source sitemap date schema migration', () => {
  let sqlite: Database.Database
  afterEach(() => sqlite?.close())

  it('preserves existing indexed pages and metadata through repeated initialization', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE ai_ready_pages (route TEXT PRIMARY KEY, markdown TEXT, updated_at TEXT, indexed INTEGER);
      CREATE TABLE _ai_ready_info (id TEXT PRIMARY KEY, value TEXT, version TEXT);
      INSERT INTO ai_ready_pages VALUES ('/cms', 'Stored CMS content', '2026-08-01', 1);
      INSERT INTO _ai_ready_info (id, version) VALUES ('schema', 'v2.3.0-drizzle');
      INSERT INTO _ai_ready_info (id, value) VALUES ('custom', 'preserved');
    `)
    const db = drizzle({ client: sqlite })
    registerDriver(db, 'better-sqlite3', sqlite)
    const event = { context: { _aiReadyDrizzle: { dialect: 'sqlite', db } } } as unknown as H3Event

    await initSchema(event)
    await initSchema(event)

    expect(sqlite.prepare('SELECT route, markdown, updated_at, indexed, source_lastmod FROM ai_ready_pages').get())
      .toEqual({ route: '/cms', markdown: 'Stored CMS content', updated_at: '2026-08-01', indexed: 1, source_lastmod: null })
    expect(sqlite.prepare('SELECT value FROM _ai_ready_info WHERE id = ?').get('custom')).toEqual({ value: 'preserved' })
  })
})
