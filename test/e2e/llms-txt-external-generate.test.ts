import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('external discovery links without a site URL', async () => {
  await setup({ rootDir: resolve('../fixtures/llms-external'), build: true, server: false })

  it('retains external references without fetching them as local generated files', async () => {
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    expect(await readFile(join(output, 'llms.txt'), 'utf8')).toContain('https://other.example/llms/reference.txt')
    expect(await readFile(join(output, 'llms/manual.txt'), 'utf8')).toContain('[About](/about.md)')
    await expect(stat(join(output, 'llms/reference.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(output, 'about.md'), 'utf8')).toContain('# ')
  })
})
