import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { fetch, setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const fixture = resolve('../fixtures/llms-manual')

describe('manual llms.txt survives prerendering', async () => {
  await setup({ rootDir: fixture, build: true, server: true })

  it('preserves the exact public file and keeps Markdown working', async () => {
    const expected = await readFile(join(fixture, 'public/llms.txt'), 'utf8')
    const output = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    expect(await readFile(join(output, 'llms.txt'), 'utf8')).toBe(expected)
    const response = await fetch('/llms.txt')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(expected)
    expect((await fetch('/llms.txt', { method: 'HEAD' })).status).toBe(200)
    expect((await fetch('/about.md')).status).toBe(200)
    expect((await fetch('/llms-full.txt')).status).toBe(404)
  })
})
