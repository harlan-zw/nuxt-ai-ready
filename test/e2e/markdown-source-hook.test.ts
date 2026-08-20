import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

function parseLeadingFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  expect(match).not.toBeNull()
  return {
    attributes: parse(match![1]!) as Record<string, unknown>,
    body: markdown.slice(match![0].length),
  }
}

describe('markdown source hook', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/markdown-source', import.meta.url)),
    dev: true,
    server: true,
  })

  it('serves the markdown a site supplies instead of converting its HTML', async () => {
    const response = await fetch(url('/about.md'))
    const markdown = await response.text()
    const { attributes, body } = parseLeadingFrontmatter(markdown)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(attributes).toMatchObject({
      name: 'supplied-source',
      title: 'About, from source',
      description: 'Markdown the site already held',
      canonical_url: 'https://test.example.com/about',
      last_updated: '2026-01-01T00:00:00.000Z',
    })
    expect(body).toContain('Supplied by the host application')
    expect(body).not.toContain('name: supplied-source')
    // The rendered page's own heading proves conversion did not run.
    expect(body).not.toContain('About this fixture')
  })

  it('converts as usual for a route the hook declines', async () => {
    const response = await fetch(url('/index.md'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).not.toContain('Supplied by the host application')
  })

  it('preserves an upstream error status', async () => {
    const response = await fetch(url('/failure.md'))

    expect(response.status).toBe(503)
  })
})
