import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findPackageJSON } from '../../src/find-package-json'
import { readPackageMetadata } from '../../src/package-metadata'

// Simulate Bun, whose `node:module` has no findPackageJSON (oven-sh/bun#23898)
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>()
  return { ...actual, default: { ...actual, findPackageJSON: undefined }, findPackageJSON: undefined }
})

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('findPackageJSON without native support', () => {
  it('falls back to the JS lookup', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ai-find-package-json-bun-'))
    directories.push(base)
    await mkdir(join(base, 'node_modules/metadata-package'), { recursive: true })
    await writeFile(join(base, 'node_modules/metadata-package/package.json'), JSON.stringify({ name: 'metadata-package', version: '3.0.0', exports: './entry.mjs' }))

    expect(findPackageJSON('metadata-package', pathToFileURL(join(base, 'package.json')))).toBe(join(base, 'node_modules/metadata-package/package.json'))
    expect(await readPackageMetadata('metadata-package', base)).toEqual({ version: '3.0.0', peerDependencies: {} })
  })
})
