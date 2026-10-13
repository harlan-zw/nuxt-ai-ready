import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('mcp server card turned off', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    nuxtConfig: {
      modules: ['@nuxtjs/mcp-toolkit'],
      mcp: { enabled: true },
      aiReady: { mcpServerCard: false },
    },
  })

  it('serves no card and keeps the MCP endpoint out of llms.txt links', async () => {
    const llmsTxt = await fetch('/llms.txt').then(response => response.text())

    expect(llmsTxt).not.toContain('[MCP')
    expect(llmsTxt).not.toMatch(/\]\([^)]*\/mcp\)/)
    for (const route of ['/mcp/server-card', '/.well-known/mcp/server-card.json', '/.well-known/mcp.json'])
      expect((await fetch(route)).status, route).toBe(404)
  })
})
