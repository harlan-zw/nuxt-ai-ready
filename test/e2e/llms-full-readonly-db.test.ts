import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

// Regression test for nuxt/scripts#818: on scripts.nuxt.com /llms-full.txt
// returned
//   Database error: ConnectionFailed("Unable to open connection to local
//   database .data/ai-ready/pages.db: 14")   (14 = SQLITE_CANTOPEN)
// because:
//   1. the page isn't prerendered, so the runtime handler serves /llms-full.txt
//      and reads the DB at request time; and
//   2. the libsql provider opened `file:<path>` directly, with none of the
//      read-only / temp-dir fallback that providers/sqlite.ts gets via
//      resolveWritableDbPath(). On a read-only deploy filesystem the open failed
//      with CANTOPEN and the error was surfaced to the user.
//
// Fix: providers/libsql.ts now routes `file:` URLs through resolveWritableDbPath,
// so a read-only dir falls back to a writable temp DB that schema-inits empty and
// degrades to "No pages indexed" instead of leaking a connection error.
//
// We point the libsql database at a read-only directory to exercise that path.
// NOTE: relies on the directory's read-only bit being enforced, i.e. a non-root
// user (the case in CI and normal dev).

const { resolve } = createResolver(import.meta.url)

const readonlyDir = mkdtempSync(`${tmpdir()}/ai-ready-ro-`)
chmodSync(readonlyDir, 0o555)
const readonlyDbPath = `${readonlyDir}/pages.db`

afterAll(() => {
  chmodSync(readonlyDir, 0o755)
  rmSync(readonlyDir, { recursive: true, force: true })
})

describe('llms-full.txt with an unopenable libsql database (#818)', async () => {
  await setup({
    rootDir: resolve('../fixtures/readonly-db'),
    // Production SSR build (no prerender) so /llms-full.txt is served by the
    // runtime handler and reads the DB, matching the scripts.nuxt.com deploy.
    dev: false,
    server: true,
    nuxtConfig: {
      aiReady: {
        database: {
          type: 'libsql',
          // libsql is configured via `url` (refineDatabaseConfig drops `filename`
          // for this driver); point it at a file in a read-only directory.
          url: `file:${readonlyDbPath}`,
        },
      },
    },
  })

  it('does not leak a raw database connection error', async () => {
    const txt = await $fetch('/llms-full.txt', { responseType: 'text' }) as string

    // The header is built from site config and must always render.
    expect(txt).toContain('# ')

    // The runtime handler must not surface the libsql CANTOPEN error; the
    // read-only dir falls back to a writable temp DB instead.
    expect(txt).not.toContain('Database error')
    expect(txt).not.toContain('Unable to open connection')
    expect(txt).not.toContain(': 14')

    // Graceful degradation: empty fallback DB → no pages indexed.
    expect(txt).toContain('No pages indexed')
  })
})
