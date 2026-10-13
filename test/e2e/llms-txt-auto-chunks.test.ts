import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('automatic sitemap chunks at runtime', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-auto-chunks-selected'),
    dev: true,
    server: true,
  })

  it('serves every indexed page through the explicitly selected chunks section', async () => {
    expect(await (await fetch('/registry/sitemap_index.xml')).text()).toContain('sitemapindex')
    const root = await (await fetch('/registry/llms.txt')).text()
    expect(root).toContain('[sitemap_index.xml](https://test.example.com/registry/sitemap_index.xml)')
    expect(root).toContain('https://test.example.com/registry/llms/chunks.txt)')
    const section = await fetch('/registry/llms/chunks.txt')
    expect(section.status).toBe(200)
    const text = await section.text()
    for (const path of ['/about', '/docs/api', '/docs/getting-started'])
      expect(text).toContain(`https://test.example.com/registry${path}.md)`)
  })
})
