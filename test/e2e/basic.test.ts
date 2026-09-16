import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('nuxt-ai-ready e2e', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    dev: true,
    server: true,
  })

  it('converts HTML to markdown via .md extension', async () => {
    const markdown = await $fetch('/index.md')
    expect(markdown).toBeTruthy()
    expect(typeof markdown).toBe('string')
    expect(markdown).toContain('#') // Should contain markdown headers
  })

  it('converts an @handle page to markdown', async () => {
    // /@login is a profile namespace, not a Vite internal. Reserving all of
    // /@ left these pages advertising a .md the handler refused to serve.
    const markdown = await $fetch('/@emilkowalski.md')
    expect(typeof markdown).toBe('string')
    expect(markdown).toContain('@emilkowalski')
    expect(markdown).not.toContain('<!DOCTYPE html>')
  })

  it('advertises the markdown sibling on an @handle page', async () => {
    const html = await $fetch('/@emilkowalski')
    expect(html).toContain('rel="alternate" type="text/markdown" href="/@emilkowalski.md"')
  })

  it('handles valid routes and converts to markdown', async () => {
    // Test with /about.md which should work
    const aboutMarkdown = await $fetch('/about.md')
    expect(aboutMarkdown).toBeTruthy()
    expect(typeof aboutMarkdown).toBe('string')
    expect(aboutMarkdown).toContain('#') // Should contain markdown headers
  })
})
