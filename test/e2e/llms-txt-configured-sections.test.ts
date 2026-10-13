import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('bounded configured section discovery', async () => {
  await setup({ rootDir: resolve('../fixtures/llms-configured-sections'), dev: true, server: true })

  it('serves complete required and optional lists through bounded child files', async () => {
    const documents = new Map<string, string>()
    async function walk(path: string) {
      if (documents.has(path))
        return
      const response = await fetch(path)
      expect(response.status, path).toBe(200)
      const text = await response.text()
      expect(text.length, path).toBeLessThanOrEqual(1024)
      documents.set(path, text)
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const url = new URL(match[1]!, 'https://test.example.com')
        if (url.pathname.startsWith('/llms/'))
          await walk(url.pathname)
      }
      const head = await fetch(path, { method: 'HEAD' })
      expect(head.status, path).toBe(200)
      expect(await head.text()).toBe('')
    }
    await walk('/llms.txt')
    const all = [...documents.values()].join('\n')
    for (const group of ['required', 'optional']) {
      for (let i = 0; i < 40; i++)
        expect(all.split(`](https://resources.example.com/${group}-${i})`)).toHaveLength(2)
    }
    expect(all).toContain('Complete instructions: '.repeat(10).trim())
    for (const text of documents.values()) {
      if (text.includes('](https://resources.example.com/optional-'))
        expect(text).toContain('## Optional')
    }
    expect(documents.size).toBeGreaterThan(2)
    expect(documents.get('/llms/Skills.TXT')).toContain('## Selected pages')
    expect(all).toContain('https://test.example.com/about.md)')
  })
})
