import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/cloudflare')

const RE_MD_H1 = /^# /
const RE_MD_PAGES_HEADING = /## (Prerendered )?Pages/

// TODO: re-enable when mdream WASM rollup issue is fixed for cloudflare-module preset
describe.skip('cloudflare module build output', async () => {
  await setup({
    server: false,
    build: true,
    fixture: fixtureDir,
  })

  function getOutputDir() {
    const ctx = useTestContext()
    // test-utils outputs to nuxt.options.buildDir + /output/ instead of .output/
    const buildDir = ctx.nuxt?.options.buildDir
    if (!buildDir) {
      throw new Error('nuxt.options.buildDir not available in test context')
    }
    return join(buildDir, 'output')
  }

  it('has expected output structure', async () => {
    const outputDir = getOutputDir()
    // Check key files exist (cloudflare-module outputs to output/public)
    const files = [
      'public/sitemap.xml',
      'public/llms.txt',
      'public/llms-full.txt',
      'server/index.mjs',
    ]

    for (const file of files) {
      const path = join(outputDir, file)
      await expect(access(path)).resolves.toBeUndefined()
    }
  })

  it('generates llms.txt with page data', async () => {
    const outputDir = getOutputDir()
    const llmsTxt = await readFile(join(outputDir, 'public', 'llms.txt'), 'utf-8')

    // Should have header
    expect(llmsTxt).toMatch(RE_MD_H1)

    // Should have pages section
    expect(llmsTxt).toMatch(RE_MD_PAGES_HEADING)

    // Should have page routes
    expect(llmsTxt).toContain('- /:')
    expect(llmsTxt).toContain('- /about:')
  })
})
