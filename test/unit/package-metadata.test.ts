import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readPackageMetadata } from '../../src/package-metadata'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture(metadata: string) {
  const base = await mkdtemp(join(tmpdir(), 'ai-package-metadata-'))
  directories.push(base)
  const dependency = join(base, 'node_modules', 'metadata-package')
  await mkdir(dependency, { recursive: true })
  await writeFile(join(dependency, 'package.json'), metadata)
  await writeFile(join(dependency, 'entry.mjs'), '')
  return base
}

describe('readPackageMetadata', () => {
  it('reads a dependency version when package exports hide package.json', async () => {
    const base = await fixture(JSON.stringify({ name: 'metadata-package', version: '3.0.0', exports: './entry.mjs' }))
    expect(await readPackageMetadata('metadata-package', base)).toEqual({ version: '3.0.0' })
    expect(await readPackageMetadata(join(base, 'node_modules/metadata-package/entry.mjs'))).toEqual({ version: '3.0.0' })
  })

  it('rejects a missing dependency', async () => {
    const base = await fixture('{}')
    await expect(readPackageMetadata('missing-package', base)).rejects.toThrow()
  })

  it('rejects corrupt metadata', async () => {
    const base = await fixture('{')
    await expect(readPackageMetadata('metadata-package', base)).rejects.toThrow()
  })

  it('reads a package from an explicit custom modules directory', async () => {
    const base = await fixture('{}')
    const modules = join(base, 'custom-modules')
    const dependency = join(modules, 'metadata-package')
    await mkdir(dependency, { recursive: true })
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ version: '4.0.0', exports: './entry.mjs' }))
    await writeFile(join(dependency, 'entry.mjs'), '')

    expect(await readPackageMetadata('metadata-package', base, { searchDirectory: modules })).toEqual({ version: '4.0.0' })
  })
})
