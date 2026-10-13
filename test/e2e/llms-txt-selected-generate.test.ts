import { access, readFile } from 'node:fs/promises'
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

describe('selected sitemaps during nuxt generate', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-discovery'),
    build: true,
    server: false,
    nuxtConfig: {
      app: { baseURL: '/registry/' },
      robots: { robotsTxt: false },
      nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } },
    },
  })

  it('does not crawl or publish unselected pages while retaining selected chunks', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const metadata = JSON.parse(await readFile(join(output, '__ai-ready/pages.json'), 'utf8')) as { pages: Array<{ route: string }> }
    expect(metadata.pages.map(page => page.route)).not.toContain('/retired')
    await expect(access(join(output, 'retired.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    for (let i = 0; i < 80; i++) {
      expect(metadata.pages.map(page => page.route)).toContain(`/skill-${i}`)
      await expect(access(join(output, `skill-${i}.md`))).resolves.toBeUndefined()
    }
  })
})
