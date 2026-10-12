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

export interface PackageMetadata {
  version?: string
  peerDependencies: Record<string, string>
}

export async function readPackageMetadata(specifier: string, base?: string, options?: { searchDirectory: string }): Promise<PackageMetadata> {
  const metadata: unknown = JSON.parse(await readFile(resolvePackageMetadataPath(specifier, base, options), 'utf8'))
  if (typeof metadata !== 'object' || metadata === null)
    throw new Error(`Invalid package metadata for ${specifier}.`)
  const version = 'version' in metadata ? metadata.version : undefined
  const peers = 'peerDependencies' in metadata ? metadata.peerDependencies : undefined
  const peerDependencies = typeof peers === 'object' && peers !== null
    ? Object.fromEntries(Object.entries(peers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}
  return typeof version === 'string' ? { version, peerDependencies } : { peerDependencies }
}
