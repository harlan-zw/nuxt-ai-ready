import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals with robots installed first', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-robots-first'),
    build: true,
    server: true,
  })

  it('adds the configured policy to the existing wildcard group', async () => {
    const robotsTxt = await $fetch<string>('/robots.txt')

    expect(robotsTxt.match(/^Content-Signal:.*$/gm)).toEqual(['Content-Signal: ai-train=no, search=yes, ai-input=yes'])
    expect(robotsTxt.match(/^Content-Usage:.*$/gm)).toEqual(['Content-Usage: train-ai=n'])
    expect(robotsTxt.match(/^User-agent: \*$/gm)).toHaveLength(1)
    const wildcardGroup = robotsTxt.slice(robotsTxt.indexOf('User-agent: *')).split(/\n\s*\n/)[0]
    expect(wildcardGroup).toContain('Disallow: /private')
    expect(wildcardGroup).toContain('Content-Signal: ai-train=no, search=yes, ai-input=yes')
  })
})
