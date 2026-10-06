import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { findPackageJSON } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function resolvePackageMetadataPath(specifier: string, base?: string, options?: { searchDirectory: string }): string {
  if (options) {
    const candidate = join(options.searchDirectory, specifier, 'package.json')
    if (existsSync(candidate))
      return candidate
  }
  const input = isAbsolute(specifier) ? pathToFileURL(specifier) : specifier
  const path = findPackageJSON(input, base && pathToFileURL(join(base, 'package.json')))
  if (!path)
    throw new Error(`Could not find package metadata for ${specifier}.`)
  return path
}

export async function readPackageMetadata(specifier: string, base?: string, options?: { searchDirectory: string }): Promise<{ version?: string }> {
  const metadata: unknown = JSON.parse(await readFile(resolvePackageMetadataPath(specifier, base, options), 'utf8'))
  if (typeof metadata !== 'object' || metadata === null)
    throw new Error(`Invalid package metadata for ${specifier}.`)
  const version = 'version' in metadata ? metadata.version : undefined
  return typeof version === 'string' ? { version } : {}
}
