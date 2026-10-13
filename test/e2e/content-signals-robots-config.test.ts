import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals set through the robots module', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-default'),
    build: true,
    server: true,
    nuxtConfig: {
      robots: {
        groups: [{ userAgent: ['*'], contentSignal: { 'search': 'yes', 'ai-input': 'no', 'ai-train': 'no' } }],
      },
    },
  })

  it('keeps the robots module policy as the only Content-Signal line', async () => {
    const robotsTxt = await $fetch<string>('/robots.txt')

    expect(robotsTxt.match(/^Content-Signal:.*$/gm)).toEqual(['Content-Signal: search=yes, ai-input=no, ai-train=no'])
  })
})
