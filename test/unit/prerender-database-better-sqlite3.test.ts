import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createPrerenderDatabase } from '../../src/prerender'

// CI runs a single modern Node, so the better-sqlite3 branch of
// createPrerenderDatabase never executes there. Node below 22 has no
// node:sqlite, and that branch shares the adapter with the native one, so a
// difference between the two drivers surfaces only here.
const realVersions = process.versions

function pretendNodeIs(major: number) {
  Object.defineProperty(process, 'versions', {
    value: { ...realVersions, node: `${major}.0.0` },
    configurable: true,
  })
}

afterEach(() => {
  Object.defineProperty(process, 'versions', { value: realVersions, configurable: true })
})

describe('prerender database on better-sqlite3', () => {
  it('runs DDL, parameterised writes and reads through the shared adapter', async () => {
    pretendNodeIs(20)
    const directory = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-'))
    const db = await createPrerenderDatabase(join(directory, 'index.sqlite'))

    await db.exec('CREATE TABLE proof (route TEXT NOT NULL, value TEXT NOT NULL)')
    await db.exec('INSERT INTO proof (route, value) VALUES (?, ?)', ['/a', 'one'])
    await db.exec('INSERT INTO proof (route, value) VALUES (?, ?)', ['/b', 'two'])

    expect(await db.all('SELECT value FROM proof ORDER BY route')).toEqual([{ value: 'one' }, { value: 'two' }])
    expect(await db.first('SELECT value FROM proof WHERE route = ?', ['/b'])).toEqual({ value: 'two' })
    expect(await db.first('PRAGMA synchronous')).toEqual({ synchronous: 0 })

    await db.close?.()
  })
})
