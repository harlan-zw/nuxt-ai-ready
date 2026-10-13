import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('application owned llms.txt', async () => {
  await setup({ rootDir: resolve('../fixtures/llms-custom'), dev: true, server: true })
  it('serves the custom route without a module override', async () => {
    expect(await (await fetch('/llms.txt')).text()).toBe('# Custom site\n\n> Application instructions.\n')
    expect((await fetch('/llms.txt', { method: 'HEAD' })).status).toBe(200)
    expect((await fetch('/about.md')).status).toBe(200)
    expect((await fetch('/llms-full.txt')).status).toBe(404)
  })
})
