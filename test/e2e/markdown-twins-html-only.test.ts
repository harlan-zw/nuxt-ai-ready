import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

const RE_RULE_PATTERN = /^\/\S*$/gm

// Prerendered as JSON, XML or plain text, never as HTML.
const NON_HTML_TWINS = [
  '/.well-known/api-catalog.md',
  '/data-feed.md',
  '/feed.md',
  '/robots.txt.md',
  '/sitemap.xml.md',
  '/llms.txt.md',
]

function publicDir(): string {
  return join(useTestContext().nuxt!.options.buildDir, 'output/public')
}

// Cloudflare serves the `_headers` file from the Wrangler assets directory.
async function headersFile(): Promise<string> {
  const wranglerPath = join(useTestContext().nuxt!.options.buildDir, 'output/server/wrangler.json')
  const wrangler = JSON.parse(await readFile(wranglerPath, 'utf8')) as { assets: { directory: string } }
  return readFile(join(dirname(wranglerPath), wrangler.assets.directory, '_headers'), 'utf8')
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false)
}

async function headerRulePatterns(): Promise<string[]> {
  return (await headersFile()).match(RE_RULE_PATTERN) || []
}

describe('markdown twins for HTML pages only', async () => {
  await setup({
    rootDir: resolve('../fixtures/markdown-twins-html-only'),
    server: false,
    build: true,
    nuxtConfig: {
      nitro: {
        compatibilityDate: '2026-10-08',
        cloudflare: { deployConfig: true, wrangler: { name: 'markdown-twins-test' } },
      },
    },
  })

  it.each(NON_HTML_TWINS)('writes no twin %s', async (twin) => {
    expect(await exists(join(publicDir(), twin))).toBe(false)
  })

  it('adds no header rule for a twin of a non-HTML route', async () => {
    const patterns = await headerRulePatterns()

    expect(patterns.filter(pattern => NON_HTML_TWINS.includes(pattern))).toEqual([])
  })

  it('keeps the twin and header rule of an HTML page', async () => {
    expect(await exists(join(publicDir(), 'about.md'))).toBe(true)
    expect(await headerRulePatterns()).toContain('/about.md')
  })
})
