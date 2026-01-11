import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixtureDir = resolve('../fixtures/cloudflare')

describe('cloudflare module build output', async () => {
  await setup({
    server: false,
    build: true,
    fixture: fixtureDir,
  })

  it('has expected output structure', async () => {
    // Check key files exist (cloudflare-module outputs to .output/public)
    const files = [
      '.output/public/sitemap.xml',
      '.output/public/llms.txt',
      '.output/public/llms-full.txt',
      '.output/server/index.mjs',
    ]

    for (const file of files) {
      const path = join(fixtureDir, file)
      await expect(access(path)).resolves.toBeUndefined()
    }
  })

  it('generates llms.txt with page data', async () => {
    const llmsTxt = await readFile(join(fixtureDir, '.output/public', 'llms.txt'), 'utf-8')

    // Should have header
    expect(llmsTxt).toMatch(/^# /)

    // Should have pages section
    expect(llmsTxt).toMatch(/## (Prerendered )?Pages/)

    // Should have page titles
    expect(llmsTxt).toContain('Welcome to Test Site')
    expect(llmsTxt).toContain('About · Test Site')
  })
})
