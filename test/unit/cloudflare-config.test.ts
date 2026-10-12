import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readCloudflareAssetRouting } from '../../src/utils/cloudflare-config'

describe('cloudflare file routing', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true })))
  })

  it.each([
    ['wrangler.json', '{"assets":{"run_worker_first":false}}', false],
    ['wrangler.jsonc', '{/* preserve existing routing */"assets":{"run_worker_first":true}}', true],
    ['wrangler.toml', '[assets]\nrun_worker_first = ["/private/*"]', ['/private/*']],
  ])('reads existing worker routing from %s', async (name, source, expected) => {
    const directory = await mkdtemp(join(tmpdir(), 'ai-ready-cloudflare-'))
    directories.push(directory)
    await writeFile(join(directory, name as string), source as string)
    const root = join(directory, 'nested')
    await mkdir(root)
    expect((await readCloudflareAssetRouting(root)).root).toEqual(expected)
  })
})
