import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('generated child discovery route ownership', async () => {
  await setup({ rootDir: resolve('../fixtures/llms-child-routes'), build: true, server: true })

  it('keeps a cached site page beside the discovery namespace', async () => {
    const html = await $fetch<string>('/llms-txt/guide')
    expect(html).toContain('Real guidance belongs to this page.')
    expect(html).not.toContain('llms.txt file not found')
  })

  it('still serves generated child files', async () => {
    const child = await $fetch<string>('/llms/docs.txt')
    expect(child).toContain('## Docs')
    expect(child).toContain('/about.md)')
  })
})
