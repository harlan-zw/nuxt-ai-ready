import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createPrerenderDatabase } from '../../src/prerender'

vi.mock('better-sqlite3', () => {
  throw new Error('better-sqlite3 must not load on Node 22+')
})

describe('prerender database', () => {
  it('uses native node:sqlite on Node 22+', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-'))
    const db = await createPrerenderDatabase(join(directory, 'index.sqlite'))

    await db.exec('CREATE TABLE proof (value TEXT NOT NULL)')
    await db.exec('INSERT INTO proof (value) VALUES (?)', ['native'])

    expect(await db.first<{ value: string }>('SELECT value FROM proof')).toEqual({ value: 'native' })
    await db.close?.()
  })
})
