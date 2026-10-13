import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

const PRERENDER_ONLY_SOURCE = /\/src\/runtime\/server\/(?:middleware\/markdown|plugins\/html-capture)\.prerender\.ts$/

async function bundledSources(serverDir: string): Promise<string[]> {
  const entries = await readdir(serverDir, { recursive: true, withFileTypes: true })
  const chunks = entries.filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
  const sources = await Promise.all(chunks.map(async (entry) => {
    const map = JSON.parse(await readFile(`${join(entry.parentPath, entry.name)}.map`, 'utf8')) as { sources: string[] }
    return map.sources.map(source => relative(serverDir, join(entry.parentPath, source)))
  }))
  return sources.flat()
}

describe('prerender-only server code', async () => {
  await setup({
    rootDir: resolve('../fixtures/cloudflare-static-links'),
    server: false,
    build: true,
  })

  const outputDir = () => join(useTestContext().nuxt!.options.buildDir, 'output')

  it('stays out of the deployed server bundle', async () => {
    const sources = await bundledSources(join(outputDir(), 'server'))
    // Source maps name every module in the bundle. No maps means no evidence.
    expect(sources.length).toBeGreaterThan(0)
    expect(sources.filter(source => PRERENDER_ONLY_SOURCE.test(source))).toEqual([])
  })

  it('still writes prerendered Markdown', async () => {
    const markdown = await readFile(join(outputDir(), 'public/about.md'), 'utf8')
    expect(markdown).toContain('canonical_url: "https://test.example.com/about"')
    const llmsFull = await readFile(join(outputDir(), 'public/llms-full.txt'), 'utf8')
    expect(llmsFull).toContain('https://test.example.com/about')
  })
})
