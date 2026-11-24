import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('disabling AI Terms', async () => {
  await setup({
    rootDir: resolve('../fixtures/ai-terms-disabled'),
    build: true,
    server: true,
  })

  it('suppresses the inherited policy and all discovery links', async () => {
    expect((await fetch(url('/.well-known/ai-terms'))).status).toBe(404)
    expect((await fetch(url('/'))).headers.get('link')).not.toContain('rel="ai-terms"')
    expect(await (await fetch(url('/robots.txt'))).text()).not.toMatch(/^AI-Terms:/m)
    await expect(access(join(useTestContext().nuxt!.options.buildDir, 'output/public/.well-known/ai-terms'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
