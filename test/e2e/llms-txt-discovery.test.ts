import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

// Mirrors skilld.dev: a small pages sitemap, large named sitemaps, and retired URLs.
describe('sitemap admission and split llms.txt discovery', async () => {
  await setup({
    rootDir: resolve('../fixtures/llms-discovery'),
    dev: true,
    server: true,

  })

  it('serves a compact index, follows every split file, and omits retired URLs and disabled resources', async () => {
    expect(await (await fetch('/__sitemap__/pages.xml')).text()).toContain('/about')
    const visited = new Set<string>()
    const documents: string[] = []
    async function walk(path: string) {
      if (visited.has(path))
        return
      visited.add(path)
      const response = await fetch(path, { redirect: 'manual' })
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/plain')
      const text = await response.text()
      expect(text.length, path).toBeLessThanOrEqual(1024)
      documents.push(text)
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const url = new URL(match[1]!, 'https://test.example.com')
        if (url.pathname.startsWith('/llms/'))
          await walk(url.pathname)
      }
    }
    await walk('/llms.txt')
    const text = documents.join('\n')
    expect(text).not.toContain('/retired')
    expect(text).not.toContain('/llms-full.txt')
    expect(text).toContain('/about.md')
    for (let i = 0; i < 80; i++)
      expect(text.split(`/skill-${i}.md)`)).toHaveLength(2)
    expect(visited.size).toBeGreaterThan(2)
  })

  it('supports HEAD and rejects unknown files and methods', async () => {
    for (const path of ['/llms.txt', '/llms/skills.txt']) {
      const response = await fetch(path, { method: 'HEAD' })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/plain')
      expect(await response.text()).toBe('')
      expect((await fetch(path, { method: 'POST' })).status).toBe(405)
    }
    expect((await fetch('/llms/unknown.txt')).status).toBe(404)
  })

  it('leaves application pages beneath /llms/ available', async () => {
    const response = await fetch('/llms/guide')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Application discovery guide')
    const head = await fetch('/llms/guide', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('leaves disabled full content to the application', async () => {
    expect((await fetch('/llms-full.txt')).status).toBe(404)
    expect(await (await fetch('/about.md')).text()).toContain('About')
  })
})
