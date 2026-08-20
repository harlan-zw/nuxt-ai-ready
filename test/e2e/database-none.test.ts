import { createResolver } from '@nuxt/kit'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

const RE_MD_H1 = /^# /

describe('database disabled', async () => {
  await setup({
    rootDir: resolve('../fixtures/database-none'),
    build: true,
    server: true,
  })

  it('generates llms.txt with prerendered pages', async () => {
    const llmsTxt = await $fetch('/llms.txt', { responseType: 'text' })

    expect(llmsTxt).toMatch(RE_MD_H1)
    expect(llmsTxt).toMatch(/- \[[^\]]+\]\(\/about\)/)
    expect(llmsTxt).toContain('## LLM Resources')
  })

  it('generates llms-full.txt with page content', async () => {
    const llmsFullTxt = await $fetch('/llms-full.txt', { responseType: 'text' })

    expect(llmsFullTxt).toContain('- **Page:** ')
    expect(llmsFullTxt).toContain('Technology Stack')
  })

  it('serves prerendered .md twins', async () => {
    const response = await fetch(url('/about.md'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(await response.text()).toContain('Technology Stack')
  })

  it('reports the database as disabled', async () => {
    const debug = await $fetch('/__ai-ready__/debug.json') as { config: { database: { type: string } } }

    expect(debug.config.database.type).toBe('none')
  })

  it('does not serve the runtime indexing endpoints', async () => {
    const [status, poll] = await Promise.all([
      fetch(url('/__ai-ready/status')),
      fetch(url('/__ai-ready/poll'), { method: 'POST' }),
    ])

    expect(status.status).toBe(404)
    expect(poll.status).toBe(404)
  })
})
