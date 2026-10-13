import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'
import { resolveCloudflareStaticHeaders } from '../helpers/cloudflare-headers'

const { resolve } = createResolver(import.meta.url)

await setup({
  rootDir: resolve('../fixtures/content-signal-static'),
  build: true,
  server: false,
  nuxtConfig: {
    nitro: { prerender: { crawlLinks: false, routes: Array.from({ length: 110 }, (_, index) => `/notes/${index + 1}`) } },
  },
})

async function readPolicy(path: string) {
  const output = useTestContext().nuxt!.options.nitro.output!.dir!
  const headers = await readFile(join(output, 'public/_headers'), 'utf8')
  return resolveCloudflareStaticHeaders(headers, path)['content-signal']
}

describe('prerendered Content-Signal policy', () => {
  it('preserves the middleware policy on static HTML and Markdown', async () => {
    expect(await readPolicy('/base/')).toBe('ai-train=no, search=yes')
    expect(await readPolicy('/base/index.md')).toBe('ai-train=no, search=yes')
    expect(await readPolicy('/base/notes/1')).toBe('ai-train=no')
    expect(await readPolicy('/base/notes/1.md')).toBe('search=no')
    expect(await readPolicy('/base/notes/2.md')).toBeUndefined()
  })

  it('keeps the explicit Markdown policy authoritative', async () => {
    expect(await readPolicy('/base/about')).toBe('ai-train=yes')
    expect(await readPolicy('/base/about/')).toBe('ai-train=yes')
    expect(await readPolicy('/base/about.md')).toBe('search=no')
  })

  it('stays within the Cloudflare rule limit while retaining policies', async () => {
    const output = useTestContext().nuxt!.options.nitro.output!.dir!
    const headers = await readFile(join(output, 'public/_headers'), 'utf8')
    expect(headers.split('\n').filter(line => line.startsWith('/')).length).toBeLessThanOrEqual(100)
    expect(await readPolicy('/base/index.md')).toBe('ai-train=no, search=yes')
  })
})
