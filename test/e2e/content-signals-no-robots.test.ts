import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

// Regression test for #40: module crashed during setup with
// "Cannot read properties of undefined (reading 'groups')" when
// contentSignal was configured but no explicit `robots` key existed.
describe('robots.txt content signals without explicit robots config', async () => {
  await setup({
    rootDir: resolve('../fixtures/content-signals-no-robots'),
    build: true,
    server: true,
  })

  it('extends robots.txt with content signals', async () => {
    const robotsTxt = await $fetch('/robots.txt')

    expect(robotsTxt).toBeTruthy()
    expect(robotsTxt).toContain('ai-train=yes')
    expect(robotsTxt).toContain('search=yes')
    expect(robotsTxt).toContain('ai-input=no')
    expect(robotsTxt).toContain('train-ai=y')
    expect(robotsTxt).toMatch(/^Disallow:\s*$/m)
  })
})
