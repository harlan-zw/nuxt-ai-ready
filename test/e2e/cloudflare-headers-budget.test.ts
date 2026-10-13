import type { ConsolaReporter } from 'consola'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { consola } from 'consola'
import { afterAll, describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

const RE_RULE = /^\/\S*$/gm

describe('cloudflare _headers rule budget', async () => {
  const logs: Array<{ type: string, message: string }> = []
  const reporter: ConsolaReporter = {
    log(log) {
      if (log.tag === 'nuxt-ai-ready')
        logs.push({ type: log.type, message: log.args.join(' ') })
    },
  }
  consola.addReporter(reporter)
  afterAll(() => consola.removeReporter(reporter))

  await setup({
    rootDir: resolve('../fixtures/cloudflare-headers-budget'),
    server: false,
    build: true,
    nuxtConfig: {
      nitro: {
        compatibilityDate: '2026-10-08',
        cloudflare: { deployConfig: true, wrangler: { name: 'headers-budget-test' } },
      },
    },
  })

  it('keeps the file inside the limit', async () => {
    // Cloudflare serves the `_headers` file from the Wrangler assets directory.
    const wranglerPath = join(useTestContext().nuxt!.options.buildDir, 'output/server/wrangler.json')
    const wrangler = JSON.parse(await readFile(wranglerPath, 'utf8')) as { assets: { directory: string } }
    const headers = await readFile(join(dirname(wranglerPath), wrangler.assets.directory, '_headers'), 'utf8')
    const rules = headers.match(RE_RULE)!

    // The route rules Nitro writes are present, so the count is real.
    expect(rules).toContain('/llms.txt')
    expect(rules.length).toBeLessThanOrEqual(100)
  })

  // The site owner cannot act on it, so it must not be a warning.
  it('reports the shared Markdown rule once as information', () => {
    const budget = logs.filter(log => ['info', 'warn'].includes(log.type) && log.message.includes('_headers'))

    expect(budget).toEqual([{ type: 'info', message: expect.stringContaining('canonical') }])
  })
})
