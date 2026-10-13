import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { fetch, setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('sitemap crawling respects prerender exclusions', async () => {
  await setup({ rootDir: resolve('../fixtures/prerender-ignored-sitemap'), build: true, server: true })

  it('indexes permitted pages and skips ignored source pages or Markdown twins', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const metadata = JSON.parse(await readFile(join(output, '__ai-ready/pages.json'), 'utf8')) as { pages: Array<{ route: string }> }
    expect(metadata.pages.map(page => page.route)).toContain('/about')
    for (const route of ['/ignored-prefix', '/ignored-regex', '/ignored-function'])
      expect(metadata.pages.map(page => page.route)).not.toContain(route)
    expect(await readFile(join(output, 'about.md'), 'utf8')).toContain('# ')
  })

  it('keeps excluded pages available as runtime Markdown', async () => {
    const response = await fetch('/ignored-prefix.md')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(await response.text()).toContain('# ')
  })
})
