import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

function getBuildDir(): string {
  const buildDir = useTestContext().nuxt?.options.buildDir
  if (!buildDir)
    throw new Error('nuxt.options.buildDir not available in test context')
  return buildDir
}

function getPublicPath(path: string): string {
  return join(getBuildDir(), 'output/public', path)
}

describe('llms.txt Markdown links in a static build', async () => {
  await setup({
    rootDir: resolve('../fixtures/markdown-links-static'),
    build: true,
    server: false,
  })

  it('links generated and copied Markdown files using the deployed base URL', async () => {
    const llmsTxt = await readFile(getPublicPath('llms.txt'), 'utf8')

    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/docs\/index\.md\): /)
    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/docs\/about\.md\): /)
    expect(llmsTxt).toContain('(/docs/docs/published.md)')
    expect(llmsTxt.match(/\]\(\/docs\/about\.md\)/g)).toHaveLength(1)
  })

  it('keeps canonical links when no deployable Markdown representation exists', async () => {
    const llmsTxt = await readFile(getPublicPath('llms.txt'), 'utf8')

    expect(llmsTxt).toContain('](/docs/guide.html)')
    expect(llmsTxt).not.toContain('/guide.html.md')
    expect(llmsTxt).toContain('](/docs/legacy)')
    expect(llmsTxt).not.toContain('/legacy.md')
    expect(llmsTxt).toContain('(/docs/docs/ignored)')
    expect(llmsTxt).not.toContain('/docs/docs/ignored.md')
    expect(llmsTxt).toContain('(/docs/docs/api)')
    expect(llmsTxt).not.toContain('/docs/docs/api.md')
  })

  it('matches the Markdown files present in the final public output', async () => {
    await expect(access(getPublicPath('index.md'))).resolves.toBeUndefined()
    await expect(access(getPublicPath('about.md'))).resolves.toBeUndefined()
    await expect(access(getPublicPath('docs/published.md'))).resolves.toBeUndefined()
    await expect(access(getPublicPath('docs/ignored.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(getPublicPath('docs/api.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
