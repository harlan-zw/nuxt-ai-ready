import { hkdfSync } from 'node:crypto'
import { loadNuxt } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createConsumer } from '../helpers/consumer'

const runtimeIndexing = {
  runtimeConfig: { appSecret: 'optional-drizzle-application-secret-32-characters' },
  aiReady: {
    runtimeSync: true,
  },
}

describe('runtime indexing with drizzle-orm installed', async () => {
  const consumer = await createConsumer('optional-drizzle', { drizzle: true })
  afterAll(consumer.remove)

  await setup({
    rootDir: consumer.rootDir,
    build: true,
    server: true,
    nuxtConfig: runtimeIndexing,
  })

  it('reads the page index', async () => {
    const status = await $fetch<{ total: number, pending: number }>('/__ai-ready/status', {
      headers: { authorization: `Bearer ${Buffer.from(hkdfSync('sha256', runtimeIndexing.runtimeConfig.appSecret, 'nuxt', 'nuxt-ai-ready:runtime-sync', 32)).toString('hex')}` },
    })

    expect(status).toMatchObject({ total: expect.any(Number), pending: expect.any(Number) })
  })
})

// Runs last: a failed setup can leave Nuxt state behind in this process.
describe('runtime indexing without drizzle-orm', async () => {
  const consumer = await createConsumer('optional-drizzle', { drizzle: false })
  afterAll(consumer.remove)

  it('fails setup and names the feature and the install command', async () => {
    const error: unknown = await loadNuxt({ cwd: consumer.rootDir, overrides: runtimeIndexing })
      .then(nuxt => nuxt.close().then(() => undefined))
      .catch((error: unknown) => error)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('`aiReady.runtimeSync`')
    expect((error as Error).message).toContain('npx nypm add drizzle-orm@1.0.0-rc.4')
  })
})

// Also fails setup, so it runs after the working build above.
describe('runtime indexing with drizzle-orm outside the peer range', async () => {
  const consumer = await createConsumer('optional-drizzle', { drizzle: { version: '0.45.2' } })
  afterAll(consumer.remove)

  it('fails setup and names the installed version and the upgrade command', async () => {
    const error: unknown = await loadNuxt({ cwd: consumer.rootDir, overrides: runtimeIndexing })
      .then(nuxt => nuxt.close().then(() => undefined))
      .catch((error: unknown) => error)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('`aiReady.runtimeSync`')
    expect((error as Error).message).toContain('0.45.2')
    expect((error as Error).message).toContain('^1.0.0-rc.4')
    expect((error as Error).message).toContain('npx nypm add drizzle-orm@1.0.0-rc.4')
  })
})
