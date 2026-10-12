import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $fetch, fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { afterAll, describe, expect, it } from 'vitest'
import { createConsumer } from '../helpers/consumer'

describe('database off without drizzle-orm', async () => {
  const consumer = await createConsumer('optional-drizzle', { drizzle: false })
  afterAll(consumer.remove)

  await setup({
    rootDir: consumer.rootDir,
    build: true,
    server: true,
  })

  it('serves llms.txt', async () => {
    const llmsTxt = await $fetch<string>('/llms.txt', { responseType: 'text' })

    expect(llmsTxt).toContain('# Storage Free')
  })

  it('serves a page as Markdown', async () => {
    const response = await fetch(url('/about.md'))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('# About the consumer')
  })

  // Nitro can still reach a hoisted drizzle-orm through Nuxt's own module
  // directories, so a stray import would build and serve. The traced server
  // dependencies show whether the database-off runtime imports it.
  it('traces no drizzle-orm into the server output', async () => {
    const outputDir = useTestContext().nuxt!.options.nitro.output!.dir!
    const manifest = JSON.parse(await readFile(join(outputDir, 'server/package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }

    expect(manifest.dependencies).toHaveProperty('vue')
    expect(manifest.dependencies).not.toHaveProperty('drizzle-orm')
  })
})
