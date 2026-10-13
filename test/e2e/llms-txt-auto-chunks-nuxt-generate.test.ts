import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const previousGenerate = process.env.NUXT_GENERATE
process.env.NUXT_GENERATE = 'true'
afterAll(() => {
  if (previousGenerate === undefined)
    delete process.env.NUXT_GENERATE
  else
    process.env.NUXT_GENERATE = previousGenerate
})

describe('automatic chunks during Nuxt generate', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-auto-chunks'),
    build: true,
    server: false,
    nuxtConfig: { robots: { robotsTxt: false }, nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } } },
  })

  it('uses the normalized index to emit sitemap-only metadata and Markdown', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const metadata = JSON.parse(await readFile(join(output, '__ai-ready/pages.json'), 'utf8')) as { pages: Array<{ route: string }> }
    const text = await readFile(join(output, 'llms.txt'), 'utf8')
    for (const path of ['/about', '/docs/api', '/docs/getting-started']) {
      expect(metadata.pages.map(page => page.route)).toContain(path)
      expect(text).toContain(`https://test.example.com/registry${path}.md)`)
      expect(await readFile(join(output, `${path}.md`), 'utf8')).toContain('# ')
    }
  })
})
