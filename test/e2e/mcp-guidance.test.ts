import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('mcp agent guidance', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    nuxtConfig: {
      modules: ['@nuxtjs/mcp-toolkit'],
      mcp: { enabled: true },
    },
  })

  it('explains when to use the indexed site content in the handshake and llms.txt', async () => {
    const response = await fetch('/mcp', {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'agent-guidance-test', version: '1.0.0' },
        },
      }),
    })
    expect(response.status).toBe(200)
    const handshake = await response.json()
    expect(handshake.result.instructions).toContain('Use this server when you need information from this site\'s indexed pages.')

    const llmsTxt = await fetch('/llms.txt').then(response => response.text())
    expect(llmsTxt).toContain('Use this MCP endpoint when you need information from this site\'s indexed pages.')
  })
})
