import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals without configuration', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-default'),
    build: true,
    server: true,
  })

  it('allows search and AI input and states no training preference', async () => {
    const robotsTxt = await $fetch<string>('/robots.txt')

    expect(robotsTxt.match(/^Content-Signal:.*$/gm)).toEqual(['Content-Signal: search=yes, ai-input=yes'])
    expect(robotsTxt).not.toMatch(/ai-train|train-ai/)
    expect(robotsTxt).not.toMatch(/^Content-Usage:/m)
    expect(robotsTxt.match(/^User-agent: \*$/gm)).toHaveLength(1)
  })
})
