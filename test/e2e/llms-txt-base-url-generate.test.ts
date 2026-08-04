import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

function getPublicDir(): string {
  const buildDir = useTestContext().nuxt?.options.buildDir
  if (!buildDir)
    throw new Error('nuxt.options.buildDir not available in test context')
  return join(buildDir, 'output/public')
}

describe('static generation beneath an app base URL', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-txt-base-url-generate'),
    build: true,
    server: false,
  })

  it('crawls sitemap routes as logical paths and emits deployed links', async () => {
    const publicDir = getPublicDir()
    const llmsTxt = await readFile(join(publicDir, 'llms.txt'), 'utf8')

    expect(llmsTxt).toContain('[API Reference - Docs](/docs/docs/api)')
    expect(llmsTxt).toContain('[About · Test Site — UTF-8 Support](/docs/about)')
    expect(llmsTxt).not.toContain('](/docs/api)')
    expect(llmsTxt).not.toContain('](/docs/about/)')
    expect(llmsTxt).not.toContain('/docs/missing')
    expect(llmsTxt).toContain('Canonical Origin: https://test.example.com/docs')
    expect(llmsTxt).toContain('[Full Content](https://test.example.com/docs/llms-full.txt)')
    expect(llmsTxt).toContain('[sitemap.xml](https://test.example.com/docs/sitemap.xml)')
    expect(llmsTxt).toContain('[robots.txt](https://test.example.com/docs/robots.txt)')

    const llmsFullTxt = await readFile(join(publicDir, 'llms-full.txt'), 'utf8')
    expect(llmsFullTxt).toContain('Canonical Origin: https://test.example.com/docs')
    expect(llmsFullTxt).toContain('- **Source:** https://test.example.com/docs/about')

    const pageData = JSON.parse(await readFile(join(publicDir, '__ai-ready/pages.json'), 'utf8')) as { pages: Array<{ route: string }> }
    expect(pageData.pages).toContainEqual(expect.objectContaining({ route: '/docs/api' }))
  })

  it('stores failed prerenders as logical error routes', async () => {
    const publicDir = getPublicDir()
    const pageData = JSON.parse(await readFile(join(publicDir, '__ai-ready/pages.json'), 'utf8')) as { errorRoutes: string[] }

    expect(pageData.errorRoutes).toContain('/missing')
    expect(pageData.errorRoutes).not.toContain('/missing.md')
    expect(pageData.errorRoutes).not.toContain('/docs/missing')
  })
})
