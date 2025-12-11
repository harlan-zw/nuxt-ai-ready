import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createResolver } from '@nuxt/kit'
import { setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/cloudflare')

describe('cloudflare pages build', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/cloudflare', import.meta.url)),
    dev: true,
    server: true,
  })

  it('appends charset headers to _headers file', async () => {
    const headersPath = join(fixtureDir, 'dist', '_headers')
    const headers = await readFile(headersPath, 'utf-8')

    // Splat greedily matches all chars including slashes, so /*.md works for all depths
    expect(headers).toContain('/*.md')
    expect(headers).toContain('Content-Type: text/markdown; charset=utf-8')
  })
})
