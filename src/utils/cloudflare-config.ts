import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseJSONC, parseTOML } from 'confbox'

const PARSERS = {
  'wrangler.json': JSON.parse,
  'wrangler.jsonc': parseJSONC,
  'wrangler.toml': parseTOML,
}

export type CloudflareAssetRouting = boolean | string[]

function parseRouting(routing: unknown): CloudflareAssetRouting | undefined {
  if (routing === undefined || typeof routing === 'boolean')
    return routing
  if (Array.isArray(routing) && routing.every(pattern => typeof pattern === 'string'))
    return routing
  throw new Error('Cloudflare assets.run_worker_first must be a boolean or an array of path patterns.')
}

/** Match Nitro's nearest Wrangler file lookup without changing its other configuration. */
export async function readCloudflareAssetRouting(rootDir: string): Promise<{ root?: CloudflareAssetRouting, environments: CloudflareAssetRouting[] }> {
  let directory = rootDir
  while (true) {
    for (const [name, parse] of Object.entries(PARSERS)) {
      const source = await readFile(join(directory, name), 'utf8').catch((error: NodeJS.ErrnoException) => {
        // Missing candidate files are expected while walking parent directories.
        if (error.code === 'ENOENT')
          return undefined
        throw error
      })
      if (source === undefined)
        continue
      const config = parse(source) as { assets?: { run_worker_first?: unknown }, env?: Record<string, { assets?: { run_worker_first?: unknown } }> }
      return {
        root: parseRouting(config.assets?.run_worker_first),
        environments: Object.values(config.env || {}).flatMap((env) => {
          const routing = parseRouting(env.assets?.run_worker_first)
          return routing === undefined ? [] : [routing]
        }),
      }
    }
    const parent = dirname(directory)
    if (parent === directory)
      return { environments: [] }
    directory = parent
  }
}
