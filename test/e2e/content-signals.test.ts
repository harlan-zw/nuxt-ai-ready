import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals'),
    build: true,
    server: true,
  })

  it('omits the content-usage directive by default', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    // Lighthouse's robots-txt audit fails Content-Usage as an unknown directive, so it is opt-in
    expect(robotsTxt).not.toMatch(/^Content-Usage\s*:/im)
  })

  it('includes content-signal directives in robots.txt', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    // contentsignals.org expects one comma-separated line, validators reject one line per signal
    expect(robotsTxt).toMatch(/^Content-Signal: ai-train=yes, search=yes, ai-input=no$/m)
    expect(robotsTxt.match(/^Content-Signal:/gm)).toHaveLength(1)
  })

  it('applies to user-agent wildcard', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    expect(robotsTxt).toContain('User-agent: *')
  })
})
