import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve(import.meta.dirname, '../../scripts/check-pack-manifest.mjs')
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function glueSource(platforms: string[], withWasiFallback: boolean): string {
  const lines = platforms.map(platform => `  try { return require('./rust.${platform}.node') } catch (e) { loadErrors.push(e) }`)
  if (withWasiFallback)
    lines.push(`  try { wasiBinding = require('./rust.wasi.cjs') } catch (e) { loadErrors.push(e) }`)
  return [`const loadErrors = []`, `let wasiBinding = null`, `function requireNative() {`, ...lines, `}`].join('\n')
}

const portablePlatforms = ['linux-x64-gnu', 'linux-arm64-gnu']
const supportedPlatforms = ['darwin-x64', 'darwin-arm64', 'win32-x64-msvc', 'linux-x64-musl', 'linux-arm64-musl']

async function packFixture(options: { platforms: string[], referenced?: string[], wasiFallback: boolean, darwinViaPackage?: boolean }): Promise<string> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-pack-fixture-'))
  temporaryDirectories.push(fixtureRoot)
  const packageRoot = join(fixtureRoot, 'package')
  const napiRoot = join(packageRoot, 'node_modules', 'mdream', 'napi')
  await mkdir(napiRoot, { recursive: true })
  await Promise.all([
    writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'nuxt-ai-ready', version: '0.0.0-test', dependencies: {} })),
    writeFile(join(packageRoot, 'node_modules', 'mdream', 'package.json'), JSON.stringify({ name: 'mdream', version: '2.0.0-beta.0-test' })),
    writeFile(join(napiRoot, 'index.mjs'), glueSource(options.referenced ?? [...options.platforms, ...supportedPlatforms], true)),
  ])
  for (const platform of options.platforms)
    await writeFile(join(napiRoot, `rust.${platform}.node`), `native ${platform}\n`)
  if (options.darwinViaPackage) {
    const darwinPackage = join(packageRoot, 'node_modules', 'mdream', 'node_modules', '@mdream', 'rust-darwin-x64')
    await mkdir(darwinPackage, { recursive: true })
    await Promise.all([
      writeFile(join(darwinPackage, 'package.json'), JSON.stringify({ name: '@mdream/rust-darwin-x64', version: '1.7.2' })),
      writeFile(join(darwinPackage, 'rust.darwin-x64.node'), 'native darwin-x64\n'),
    ])
  }
  if (options.wasiFallback) {
    await Promise.all([
      writeFile(join(napiRoot, 'rust.wasi.cjs'), 'module.exports = {}\n'),
      writeFile(join(napiRoot, 'rust.wasm32-wasi.wasm'), 'wasm\n'),
    ])
  }
  const tarball = join(fixtureRoot, 'fixture.tgz')
  await execa('tar', ['-czf', tarball, '-C', fixtureRoot, 'package'])
  return tarball
}

describe('portable archive native coverage', () => {
  it('rejects a bundled mdream that only loads on glibc linux', async () => {
    const tarball = await packFixture({ platforms: portablePlatforms, wasiFallback: false })

    const result = await execa(process.execPath, [scriptPath, tarball], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('rust.darwin-x64.node')
    expect(result.stderr).toContain('rust.darwin-arm64.node')
    expect(result.stderr).toContain('rust.win32-x64-msvc.node')
    expect(result.stderr).toContain('rust.linux-x64-musl.node')
    expect(result.stderr).toContain('rust.linux-arm64-musl.node')
    expect(result.stderr).not.toContain('rust.linux-x64-gnu.node missing')
    expect(result.stderr).toContain('WASI')
  })

  it('accepts a bundled mdream with every supported platform binding and the WASI fallback', async () => {
    const tarball = await packFixture({ platforms: [...portablePlatforms, ...supportedPlatforms], wasiFallback: true })

    const result = await execa(process.execPath, [scriptPath, tarball], { reject: false })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('accepts a supported platform served by a bundled platform package instead of an inline binary', async () => {
    const tarball = await packFixture({
      platforms: [...portablePlatforms, 'darwin-arm64', 'win32-x64-msvc', 'linux-x64-musl', 'linux-arm64-musl'],
      wasiFallback: true,
      darwinViaPackage: true,
    })

    const result = await execa(process.execPath, [scriptPath, tarball], { reject: false })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('still checks the manifest of an archive without bundled mdream', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-pack-fixture-'))
    temporaryDirectories.push(fixtureRoot)
    const packageRoot = join(fixtureRoot, 'package')
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: 'nuxt-ai-ready',
      version: '0.0.0-test',
      dependencies: { mdream: 'https://pkg.pr.new/harlan-zw/mdream@dd56f56' },
    }))
    const tarball = join(fixtureRoot, 'fixture.tgz')
    await execa('tar', ['-czf', tarball, '-C', fixtureRoot, 'package'])

    const result = await execa(process.execPath, [scriptPath, tarball], { reject: false })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('mdream: https://pkg.pr.new/harlan-zw/mdream@dd56f56')
  })
})
