import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('llms.txt generated before page indexing', async () => {
  await setup({ rootDir: resolve('../fixtures/llms-txt-early-prerender'), build: true, server: false })

  it('writes the final page title and available Markdown twin', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    const llmsTxt = await readFile(join(output, 'llms.txt'), 'utf8')
    expect(llmsTxt).toContain('[About · Test Site')
    expect(llmsTxt).toContain('(https://test.example.com/about.md)')
    expect(await readFile(join(output, 'about.md'), 'utf8')).toContain('# About')
  })
})
