import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/netlify')

describe('netlify build output', async () => {
  await setup({
    server: false,
    build: true,
    fixture: fixtureDir,
    nuxtConfig: {
      nitro: {
        preset: 'netlify',
      },
    },
  })

  it('has _headers file with charset headers', async () => {
    const headersPath = join(fixtureDir, 'dist', '_headers')
    const headers = await readFile(headersPath, 'utf-8')

    // Netlify _headers format uses glob patterns for .md files
    expect(headers).toContain('/*.md')
    expect(headers).toContain('Content-Type: text/markdown; charset=utf-8')
  })

  it('has expected output structure', async () => {
    // Check key files exist (only static output, not .netlify functions which require real deployment)
    const files = [
      'dist/_headers',
      'dist/_redirects',
      'dist/sitemap.xml',
      'dist/llms.txt',
      'dist/llms-full.txt',
    ]

    for (const file of files) {
      const path = join(fixtureDir, file)
      await expect(access(path)).resolves.toBeUndefined()
    }
  })

  it('generates llms.txt with page titles', async () => {
    const llmsTxt = await readFile(join(fixtureDir, 'dist', 'llms.txt'), 'utf-8')

    // Should have canonical origin
    expect(llmsTxt).toContain('Canonical Origin:')

    // Should have page titles (not just paths)
    expect(llmsTxt).toContain('Welcome to Test Site')
    expect(llmsTxt).toContain('About · Test Site')
    expect(llmsTxt).toContain('API Reference')
    expect(llmsTxt).toContain('Getting Started')

    // Should use relative paths
    expect(llmsTxt).toContain('](/')
    expect(llmsTxt).toContain('](/about)')
  })
})
