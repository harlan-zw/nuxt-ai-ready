import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals with Content-Usage', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-content-usage'),
    build: true,
    server: true,
  })

  it('emits content-usage beside content-signal when opted in', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    expect(robotsTxt).toMatch(/^Content-Usage: train-ai=y$/m)
    expect(robotsTxt).toMatch(/^Content-Signal: ai-train=yes, search=yes, ai-input=no$/m)
    expect(robotsTxt.match(/^Content-Signal:/gm)).toHaveLength(1)
  })
})
