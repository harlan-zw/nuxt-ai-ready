import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('automatic sitemap chunks in a static build', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-auto-chunks'),
    build: true,
    server: false,
    nuxtConfig: {
      robots: { robotsTxt: false },
      nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } },
    },
  })

  it('admits every automatic chunk by default and emits its linked Markdown', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const text = await readFile(join(output, 'llms.txt'), 'utf8')
    expect(text).toContain('[sitemap_index.xml](https://test.example.com/registry/sitemap_index.xml)')
    for (const path of ['/about', '/docs/api', '/docs/getting-started']) {
      expect(text).toContain(`https://test.example.com/registry${path}.md)`)
      expect(await readFile(join(output, `${path}.md`), 'utf8')).toContain('# ')
    }
  })
})
