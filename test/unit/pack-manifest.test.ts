import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve(import.meta.dirname, '../../scripts/check-pack-manifest.mjs')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function packFixture(manifest: Record<string, unknown>, files: Record<string, string> = {}): Promise<string> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-pack-fixture-'))
  temporaryDirectories.push(fixtureRoot)
  const packageRoot = join(fixtureRoot, 'package')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'nuxt-ai-ready', version: '0.0.0-test', ...manifest }))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(packageRoot, path)), { recursive: true })
    await writeFile(join(packageRoot, path), content)
  }
  const tarball = join(fixtureRoot, 'fixture.tgz')
  await execa('tar', ['-czf', tarball, '-C', fixtureRoot, 'package'])
  return tarball
}

function check(tarball: string) {
  return execa(process.execPath, [scriptPath, tarball], { reject: false })
}

describe('packed manifest check', () => {
  it('accepts an archive that resolves every dependency from the registry', async () => {
    const tarball = await packFixture(
      { dependencies: { 'mdream': '^2.0.1', '@mdream/js': '^2.0.1' } },
      { 'dist/module.mjs': 'export default {}\n' },
    )

    const result = await check(tarball)

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('rejects an archive that declares bundled dependencies', async () => {
    const tarball = await packFixture({
      dependencies: { mdream: '2.0.0' },
      bundledDependencies: ['mdream'],
    })

    const result = await check(tarball)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('bundledDependencies: mdream')
  })

  it('rejects the legacy bundleDependencies spelling', async () => {
    const tarball = await packFixture({
      dependencies: { mdream: '2.0.0' },
      bundleDependencies: ['mdream'],
    })

    const result = await check(tarball)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('bundleDependencies: mdream')
  })

  it('rejects an archive that ships a nested node_modules directory', async () => {
    const tarball = await packFixture(
      { dependencies: { mdream: '^2.0.1' } },
      { 'node_modules/mdream/package.json': '{"name":"mdream"}\n' },
    )

    const result = await check(tarball)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('vendored package node_modules/mdream')
  })

  it('rejects non-registry dependency specifiers', async () => {
    const tarball = await packFixture({
      dependencies: { mdream: 'https://pkg.pr.new/harlan-zw/mdream@dd56f56', defu: 'catalog:' },
    })

    const result = await check(tarball)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('mdream: https://pkg.pr.new/harlan-zw/mdream@dd56f56')
    expect(result.stderr).toContain('defu: catalog:')
  })
})
