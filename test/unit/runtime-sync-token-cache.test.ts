import { hkdfSync } from 'node:crypto'
import { chmod, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { loadNuxt } from '@nuxt/kit'
import { afterEach, expect, it, vi } from 'vitest'
import Module from '../../src/module'

afterEach(() => vi.unstubAllEnvs())

it('replaces a readable CLI cache with a private derived token', async () => {
  const cacheDir = resolve(import.meta.dirname, '../../node_modules/.cache')
  await mkdir(cacheDir, { recursive: true })
  const rootDir = await mkdtemp(resolve(cacheDir, 'ai-ready-token-cache-'))
  const path = resolve(rootDir, 'node_modules/.cache/nuxt/ai-ready/secret')
  const root = 'private-runtime-sync-application-secret-32-characters'
  const expected = Buffer.from(hkdfSync('sha256', root, 'nuxt', 'nuxt-ai-ready:runtime-sync', 32)).toString('hex')
  vi.stubEnv('NUXT_APP_SECRET', root)
  vi.stubEnv('NITRO_APP_SECRET', undefined)
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, 'previous-token')
    await chmod(path, 0o644)
    await using previousFile = await open(path)
    const nuxt = await loadNuxt({
      cwd: rootDir,
      dev: true,
      overrides: {
        modules: [Module],
        buildDir: resolve(rootDir, '.nuxt'),
        devtools: { enabled: false },
        aiReady: { runtimeSync: true },
      },
    })
    try {
      expect(await readFile(path, 'utf8')).toBe(expected)
      expect((await stat(path)).mode & 0o777).toBe(0o600)
      expect(await previousFile.readFile('utf8')).toBe('previous-token')
    }
    finally {
      await nuxt.close()
    }
  }
  finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})
