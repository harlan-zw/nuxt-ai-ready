/* eslint-disable harlanzw/no-test-file-reads -- Inspect emitted deployment artifacts, not source files. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('static split discovery files beneath a base URL', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-discovery'),
    build: true,
    server: false,
    nuxtConfig: {
      app: { baseURL: '/registry/' },
      sitemap: { sitemapsPathPrefix: '/catalog/' },
      robots: { robotsTxt: false },
      nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } },
    },
  })

  it('emits every linked file and Markdown page with stored metadata', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const seen = new Set<string>()
    const documents: string[] = []
    async function walk(path: string) {
      if (seen.has(path))
        return
      seen.add(path)
      const text = await readFile(join(output, path), 'utf8')
      expect(text.length, path).toBeLessThanOrEqual(1024)
      documents.push(text)
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const url = new URL(match[1]!, 'https://test.example.com')
        if (url.pathname.startsWith('/registry/llms/'))
          await walk(url.pathname.slice('/registry'.length))
        if (url.pathname.endsWith('.md'))
          expect(await readFile(join(output, url.pathname.slice('/registry'.length)), 'utf8')).toContain('# ')
      }
    }
    await walk('/llms.txt')
    const text = documents.join('\n')
    expect(text).toContain('[Skill 0](https://test.example.com/registry/skill-0.md): Install this skill.')
    expect(text).not.toContain('/retired')
    expect(text).not.toContain('llms-full.txt')
    expect(seen.size).toBeGreaterThan(2)
    for (let i = 0; i < 80; i++)
      expect(text.split(`/skill-${i}.md)`)).toHaveLength(2)
    await expect(readFile(join(output, 'llms-full.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
