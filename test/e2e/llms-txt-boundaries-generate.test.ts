import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('untrusted sitemap and discovery URLs during generation', async () => {
  await setup({ rootDir: resolve('../fixtures/llms-boundaries'), build: true, server: false })

  it('preserves local discovery children without writing outside public output', async () => {
    const buildDir = useTestContext().nuxt!.options.buildDir
    const output = join(buildDir, 'output/public')
    expect(await readFile(join(output, 'llms.txt'), 'utf8')).toContain('/llms/pages.txt')
    expect(await readFile(join(output, 'llms/pages.txt'), 'utf8')).toContain('/about.md')
    expect(await readFile(join(output, 'about.md'), 'utf8')).toContain('# ')
    await expect(stat(join(buildDir, 'about.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(join(buildDir, 'output/about.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    const metadata = JSON.parse(await readFile(join(output, '__ai-ready/pages.json'), 'utf8'))
    expect(metadata.pages.some((page: { route: string }) => page.route.includes('..') || page.route.includes('%'))).toBe(false)
  })
})
