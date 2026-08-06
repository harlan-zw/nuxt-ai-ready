import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Keep local runtime paths relative to the public module entry after Rollup code splitting. */
export function resolveModuleEntryUrl(url: string): string {
  const directory = dirname(fileURLToPath(url))
  if (basename(directory) !== 'shared')
    return url
  return pathToFileURL(join(directory, '../module.mjs')).href
}
