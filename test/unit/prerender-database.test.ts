import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createPrerenderDatabase } from '../../src/prerender'

vi.mock('better-sqlite3', () => {
  throw new Error('better-sqlite3 must not load when Node has native SQLite')
})

describe('prerender database', () => {
  it('uses native node:sqlite when Node supports it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-'))
    const db = await createPrerenderDatabase(join(directory, 'index.sqlite'))

    await db.exec('CREATE TABLE proof (value TEXT NOT NULL)')
    await db.exec('INSERT INTO proof (value) VALUES (?)', ['native'])

    expect(await db.first<{ value: string }>('SELECT value FROM proof')).toEqual({ value: 'native' })
    await db.close?.()
  })

  it('opens without per-statement fsync', async () => {
    // Every page insert runs as its own implicit transaction. At the default
    // `synchronous = FULL` that is one fsync per page, which dominated the
    // prerender indexer. The build database is rebuilt every build, so the
    // durability it buys is worth nothing.
    const directory = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-'))
    const db = await createPrerenderDatabase(join(directory, 'index.sqlite'))

    expect(await db.first<{ synchronous: number }>('PRAGMA synchronous')).toEqual({ synchronous: 0 })
    await db.close?.()
  })
})
