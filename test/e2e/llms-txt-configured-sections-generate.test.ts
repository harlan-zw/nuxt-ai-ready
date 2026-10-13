/* eslint-disable harlanzw/no-test-file-reads -- Inspect emitted deployment artifacts, not source files. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('static configured section discovery', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-configured-sections'),
    build: true,
    server: false,
    nuxtConfig: { robots: { robotsTxt: false }, nitro: { static: true, prerender: { routes: ['/about'], crawlLinks: false, failOnError: true } } },
  })

  it('writes every linked configured child file without losing links', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const documents = new Map<string, string>()
    async function walk(path: string) {
      if (documents.has(path))
        return
      const text = await readFile(join(output, path), 'utf8')
      expect(text.length, path).toBeLessThanOrEqual(1024)
      documents.set(path, text)
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const url = new URL(match[1]!, 'https://test.example.com')
        if (url.pathname.startsWith('/llms/'))
          await walk(url.pathname)
      }
    }
    await walk('/llms.txt')
    const all = [...documents.values()].join('\n')
    for (let i = 0; i < 25; i++)
      expect(all).toContain(`First paragraph ${i}.\n\nSecond paragraph ${i}.`)
    expect(all).not.toContain('Hidden optional context.')
    for (const group of ['required', 'optional']) {
      for (let i = 0; i < 40; i++)
        expect(all.split(`](https://resources.example.com/${group}-${i})`)).toHaveLength(2)
    }
    expect(all).toContain('Complete instructions: '.repeat(10).trim())
    expect(documents.get('/llms/Skills.TXT')).toContain('## Selected pages')
    expect(all).toContain('https://test.example.com/about.md)')
  })
})
