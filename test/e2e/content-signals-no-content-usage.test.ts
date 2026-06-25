import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('robots.txt content signals without Content-Usage', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-no-content-usage'),
    build: true,
    server: true,
  })

  it('omits content-usage while preserving content-signal directives', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    expect(robotsTxt).not.toMatch(/^Content-Usage\s*:/im)
    expect(robotsTxt).toContain('Content-Signal:')
    expect(robotsTxt).toContain('ai-train=yes')
    expect(robotsTxt).toContain('search=yes')
    expect(robotsTxt).toContain('ai-input=no')
  })
})
