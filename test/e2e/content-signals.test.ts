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

  it('includes content-usage directive in robots.txt', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    expect(robotsTxt).toBeTruthy()
    expect(typeof robotsTxt).toBe('string')

    // Should include train-ai directive based on aiTrain: true
    expect(robotsTxt).toContain('train-ai=y')
  })

  it('includes content-signal directives in robots.txt', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    // Should include all three content signal directives
    expect(robotsTxt).toContain('ai-train=yes')
    expect(robotsTxt).toContain('search=yes')
    expect(robotsTxt).toContain('ai-input=no')
  })

  it('applies to user-agent wildcard', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    // Should have User-agent: * somewhere before the directives
    expect(robotsTxt).toContain('User-agent: *')
  })
})
