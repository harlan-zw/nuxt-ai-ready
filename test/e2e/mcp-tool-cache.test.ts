import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { result: { content: { text: string }[] } }
  return body.result.content[0]!.text
}

describe('mcp tool cache', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    build: true,
    server: true,
    nuxtConfig: {
      modules: ['@nuxtjs/mcp-toolkit'],
      mcp: { enabled: true },
    },
  })

  it('answers each route from its own cache entry', async () => {
    expect(await callTool('get_page_markdown', { route: '/guide/setup' })).toContain('/guide/setup')
    expect(await callTool('get_page_markdown', { route: '/guide-setup' })).toContain('/guide-setup')
  })
})
