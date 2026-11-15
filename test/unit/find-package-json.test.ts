import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as nodeModule from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findPackageJSONFallback } from '../../src/find-package-json'

type FindPackageJSON = (specifier: string | URL, base?: string | URL) => string | undefined

let root: string
let base: URL

async function write(path: string, content: string | object) {
  const target = join(root, path)
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
}

beforeAll(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), 'ai-find-package-json-')))
  await write('app/package.json', { name: 'app', exports: './index.js' })
  await write('app/index.js', '')
  await write('app/src/deep/file.js', '')
  // `exports` hides ./package.json, and a nested dist/package.json must not win over the root
  await write('app/node_modules/hidden/package.json', { name: 'hidden', exports: './dist/index.js' })
  await write('app/node_modules/hidden/dist/package.json', { type: 'module' })
  await write('app/node_modules/hidden/dist/index.js', '')
  // import-only exports, which createRequire().resolve() cannot resolve
  await write('app/node_modules/esm-only/package.json', { name: 'esm-only', exports: { import: './index.mjs' } })
  await write('app/node_modules/esm-only/index.mjs', '')
  await write('app/node_modules/@scope/pkg/package.json', { name: '@scope/pkg' })
  await write('app/node_modules/@scope/pkg/sub/file.js', '')
  // hoisted one level above the app
  await write('node_modules/hoisted/package.json', { name: 'hoisted' })
  base = pathToFileURL(join(root, 'app/package.json'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

const native = (nodeModule as { findPackageJSON?: FindPackageJSON }).findPackageJSON

describe.each([
  ['native', native],
  ['fallback', findPackageJSONFallback],
] as const)('findPackageJSON (%s)', (label, find) => {
  if (!find) {
    it.skip(`node:module has no findPackageJSON in this runtime (${label})`)
    return
  }
  const path = (relative: string) => join(root, relative)

  it('resolves a bare specifier to the package root even when exports hide ./package.json', () => {
    expect(find('hidden', base)).toBe(path('app/node_modules/hidden/package.json'))
    expect(find('esm-only', base)).toBe(path('app/node_modules/esm-only/package.json'))
  })

  it('resolves scoped packages and subpaths to the package root', () => {
    expect(find('@scope/pkg', base)).toBe(path('app/node_modules/@scope/pkg/package.json'))
    expect(find('@scope/pkg/sub/file.js', base)).toBe(path('app/node_modules/@scope/pkg/package.json'))
  })

  it('walks node_modules up from the base', () => {
    expect(find('hoisted', base)).toBe(path('node_modules/hoisted/package.json'))
    expect(find('hidden', pathToFileURL(path('app/src/deep/file.js')))).toBe(path('app/node_modules/hidden/package.json'))
  })

  it('resolves a self-reference', () => {
    expect(find('app', base)).toBe(path('app/package.json'))
  })

  it('accepts a base given as a path or a directory URL', () => {
    expect(find('hidden', path('app/package.json'))).toBe(path('app/node_modules/hidden/package.json'))
    expect(find('hidden', pathToFileURL(`${path('app')}/`))).toBe(path('app/node_modules/hidden/package.json'))
  })

  it('throws for a missing package', () => {
    expect(() => find('missing-package', base)).toThrow(expect.objectContaining({ code: 'ERR_MODULE_NOT_FOUND' }))
  })

  it('finds the nearest package.json for a relative path', () => {
    expect(find('./src/deep/file.js', base)).toBe(path('app/package.json'))
    expect(find('./', base)).toBe(path('app/package.json'))
    expect(find('./node_modules/hidden/dist/index.js', base)).toBe(path('app/node_modules/hidden/dist/package.json'))
    expect(find('./node_modules/hidden/dist', base)).toBe(path('app/node_modules/hidden/package.json'))
    expect(find('./node_modules/hidden/dist/', base)).toBe(path('app/node_modules/hidden/dist/package.json'))
  })

  it('stops at a node_modules boundary', () => {
    expect(find('./node_modules/hidden', base)).toBeUndefined()
  })

  it('finds the nearest package.json for a file: URL or absolute path', () => {
    const file = path('app/node_modules/hidden/dist/index.js')
    expect(find(pathToFileURL(file))).toBe(path('app/node_modules/hidden/dist/package.json'))
    expect(find(pathToFileURL(file).href)).toBe(path('app/node_modules/hidden/dist/package.json'))
    expect(find(path('app/src/deep/file.js'), base)).toBe(path('app/package.json'))
  })

  it('requires a base for paths and bare specifiers', () => {
    expect(() => find(path('app/src/deep/file.js'))).toThrow(expect.objectContaining({ code: 'ERR_UNSUPPORTED_RESOLVE_REQUEST' }))
    expect(() => find('hidden')).toThrow(expect.objectContaining({ code: 'ERR_INVALID_URL' }))
  })

  it('rejects non-file URLs', () => {
    expect(() => find('node:fs', base)).toThrow(expect.objectContaining({ code: 'ERR_INVALID_URL_SCHEME' }))
  })

  it('throws for a missing file', () => {
    expect(() => find('./missing.js', base)).toThrow(expect.objectContaining({ code: 'ERR_MODULE_NOT_FOUND' }))
  })
})
