import { readFileSync, statSync } from 'node:fs'
import * as nodeModule from 'node:module'
import { basename, dirname, isAbsolute, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type FindPackageJSON = (specifier: string | URL, base?: string | URL) => string | undefined

/**
 * `module.findPackageJSON()` from `node:module`, with a fallback for runtimes that lack it.
 *
 * The native API is experimental (Node 23.2.0 / 22.14.0, Stability 1.1) and Bun does not
 * implement it (oven-sh/bun#23898). A named import of it fails at link time under Bun, so it
 * is read off the namespace and only called when present.
 */
export function findPackageJSON(specifier: string | URL, base?: string | URL): string | undefined {
  const native = (nodeModule as { findPackageJSON?: FindPackageJSON }).findPackageJSON
  return typeof native === 'function'
    ? native(specifier, base)
    : findPackageJSONFallback(specifier, base)
}

function moduleNotFound(message: string): Error {
  return Object.assign(new Error(message), { code: 'ERR_MODULE_NOT_FOUND' })
}

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}

function toBaseURL(base: string | URL | undefined): URL | undefined {
  if (base === undefined || base instanceof URL)
    return base
  return isAbsolute(base) ? pathToFileURL(base) : new URL(base)
}

function toFilePath(url: URL): string {
  if (url.protocol !== 'file:')
    throw Object.assign(new TypeError(`The URL must be of scheme file: ${url.href}`), { code: 'ERR_INVALID_URL_SCHEME' })
  return fileURLToPath(url)
}

function isBareSpecifier(specifier: string): boolean {
  if (specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..')
    return false
  return !URL.canParse(specifier)
}

function packageName(specifier: string): string {
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
  if (!name || name.startsWith('.') || name.includes('\\') || name.includes('%') || (specifier.startsWith('@') && parts.length < 2))
    throw Object.assign(new TypeError(`Invalid module specifier "${specifier}"`), { code: 'ERR_INVALID_MODULE_SPECIFIER' })
  return name
}

/**
 * Walks up from the directory containing `path` (or from `path` itself when it ends in a
 * separator) and returns the first `package.json`, stopping at a `node_modules` boundary.
 */
function findNearestPackageJSON(path: string): string | undefined {
  let directory = path.endsWith(sep) ? path.slice(0, -1) || sep : dirname(path)
  while (true) {
    if (basename(directory) === 'node_modules')
      return undefined
    const candidate = join(directory, 'package.json')
    if (isFile(candidate))
      return candidate
    const parent = dirname(directory)
    if (parent === directory)
      return undefined
    directory = parent
  }
}

function readManifest(packageJSONPath: string): { name?: unknown, exports?: unknown } {
  try {
    return JSON.parse(readFileSync(packageJSONPath, 'utf8'))
  }
  catch {
    return {}
  }
}

/**
 * Resolves a bare specifier to its package root the way Node's ESM resolver does: a
 * self-reference first, then `node_modules/<name>` in each ancestor of `base`. The package's
 * `exports` are not consulted, so packages that do not export `./package.json` still resolve.
 */
function findPackageRoot(specifier: string, base: URL): string {
  const name = packageName(specifier)
  const basePath = toFilePath(base)
  const own = findNearestPackageJSON(basePath)
  if (own) {
    const metadata = readManifest(own)
    if (metadata.name === name && metadata.exports !== undefined && metadata.exports !== null)
      return own
  }
  let directory = toFilePath(new URL('.', base))
  while (true) {
    const candidate = join(directory, 'node_modules', name, 'package.json')
    if (isFile(candidate))
      return candidate
    const parent = dirname(directory)
    if (parent === directory)
      break
    directory = parent
  }
  throw moduleNotFound(`Cannot find package '${name}' imported from ${basePath}`)
}

/**
 * Pure JS implementation of `module.findPackageJSON()`, used when `node:module` does not provide it.
 *
 * - Bare specifiers (`pkg`, `@scope/pkg/sub`) return the package root's `package.json`.
 * - Relative and absolute paths (resolved against `base`, as URLs) and `file:` URLs return the
 *   nearest `package.json` above the target, which must exist.
 */
export function findPackageJSONFallback(specifier: string | URL, base?: string | URL): string | undefined {
  const baseURL = toBaseURL(base)
  if (typeof specifier === 'string' && isBareSpecifier(specifier)) {
    if (!baseURL)
      throw Object.assign(new TypeError(`Cannot resolve "${specifier}" without a base`), { code: 'ERR_INVALID_URL' })
    return findPackageRoot(specifier, baseURL)
  }
  let target: string
  if (specifier instanceof URL)
    target = toFilePath(specifier)
  else if (URL.canParse(specifier))
    target = toFilePath(new URL(specifier))
  else if (baseURL)
    target = toFilePath(new URL(specifier, baseURL))
  else
    throw Object.assign(new TypeError(`Cannot resolve "${specifier}" without a base`), { code: 'ERR_UNSUPPORTED_RESOLVE_REQUEST' })
  if (!statSync(target, { throwIfNoEntry: false }))
    throw moduleNotFound(`Cannot find module '${target}'${baseURL ? ` imported from ${toFilePath(baseURL)}` : ''}`)
  return findNearestPackageJSON(target)
}
