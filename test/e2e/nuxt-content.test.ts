import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('@nuxt/content integration', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/nuxt-content', import.meta.url)),
    dev: true,
    server: true,
  })

  it('serves source markdown from a page collection', async () => {
    const md = await $fetch('/blog/hello-world.md')
    expect(typeof md).toBe('string')
    // Frontmatter pulled from the content file's frontmatter, not page meta
    expect(md).toContain('title: "Source-Authored Title"')
    expect(md).toContain('description: "Comes straight from frontmatter')
    // canonical_url + last_updated are still merged in by our middleware
    expect(md).toContain('canonical_url: "https://test.example.com/blog/hello-world"')
    expect(md).toContain('last_updated:')
    // Body is the source markdown, not HTML→markdown round-trip
    expect(md).toContain('# Hello from Nuxt Content')
    expect(md).toContain('load-bearing for the test')
    expect(md).toContain('- bullet one')
  })

  it('falls through to HTML conversion for non-content routes', async () => {
    const md = await $fetch('/about.md')
    expect(typeof md).toBe('string')
    expect(md).toContain('#')
    // Sanity: shouldn't accidentally serve content output for unrelated routes
    expect(md).not.toContain('Source-Authored Title')
  })
})
