import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/netlify')

function getHeaderBlock(contents: string, route: string) {
  const lines = contents.split(/\r?\n/)
  const start = lines.lastIndexOf(route)
  const end = lines.findIndex((line, index) => index > start && line.length > 0 && !/^\s/.test(line))
  return lines.slice(start, end === -1 ? undefined : end).join('\n')
}

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
    const markdownBlock = getHeaderBlock(headers, '/*.md')
    expect(headers.match(/^\/\*\.md$/gm)).toHaveLength(1)
    expect(markdownBlock).toContain('Content-Type: text/markdown; charset=utf-8')
    expect(markdownBlock).toContain('X-Robots-Tag: noindex')

    const llmsBlock = getHeaderBlock(headers, '/llms.txt')
    expect(llmsBlock).toContain('Content-Type: text/plain; charset=utf-8')
    expect(llmsBlock).toContain('X-Robots-Tag: noindex')
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

  it('generates llms.txt with page routes and descriptions', async () => {
    const llmsTxt = await readFile(join(fixtureDir, 'dist', 'llms.txt'), 'utf-8')

    // Should have canonical origin
    expect(llmsTxt).toContain('Canonical Origin:')

    // Should have page routes with titles and descriptions
    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/index\.md\): /)
    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/about\.md\): /)
    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/docs\/api\.md\): /)
    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/docs\/getting-started\.md\): /)
  })
})
