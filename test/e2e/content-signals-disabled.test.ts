import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals turned off', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-default'),
    build: true,
    server: true,
    nuxtConfig: {
      aiReady: { contentSignal: false },
    },
  })

  it('omits the Content-Signal line', async () => {
    const robotsTxt = await $fetch<string>('/robots.txt')

    expect(robotsTxt).toMatch(/^User-agent: \*$/m)
    expect(robotsTxt).not.toMatch(/^Content-Signal:/m)
  })
})
