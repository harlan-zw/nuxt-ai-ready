import type { ConsolaReporter } from 'consola'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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
  })

  it('keeps the file inside the limit', async () => {
    const headers = await readFile(join(useTestContext().nuxt!.options.buildDir, 'output/public/_headers'), 'utf8')

    expect(headers.match(RE_RULE)!.length).toBeLessThanOrEqual(100)
  })

  // The site owner cannot act on it, so it must not be a warning.
  it('reports the shared Markdown rule once as information', () => {
    const budget = logs.filter(log => ['info', 'warn'].includes(log.type) && log.message.includes('_headers'))

    expect(budget).toEqual([{ type: 'info', message: expect.stringContaining('canonical') }])
  })
})
