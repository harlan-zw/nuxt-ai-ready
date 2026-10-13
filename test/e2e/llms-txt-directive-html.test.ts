import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('llms.txt directive in HTML', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    build: true,
    server: true,
    nuxtConfig: {
      aiReady: { llmsTxt: { directive: { html: true } } },
    },
  })

  it('links llms.txt first thing in the body', async () => {
    const html = await $fetch<string>('/about')
    const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1)
    expect(body).toMatch(/^<a href="\/llms\.txt"[^>]*>[^<]*llms\.txt<\/a>/)
  })

  it('keeps the link visually hidden', async () => {
    const html = await $fetch<string>('/about')
    expect(html).toMatch(/<a href="\/llms\.txt" style="[^"]*clip:rect\(0,0,0,0\)/)
  })
})
