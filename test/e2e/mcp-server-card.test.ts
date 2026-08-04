import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const cardRoute = '/.well-known/mcp/server-card.json'

async function mcpRequest(method: string, params?: Record<string, unknown>) {
  const response = await fetch('/agent/mcp', {
    method: 'POST',
    headers: {
      'accept': 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })
  expect(response.status).toBe(200)
  return response.json()
}

describe('late MCP Server Card dependency', async () => {
  await setup({
    rootDir: resolve('../fixtures/mcp-server-card-late'),
    build: true,
    server: true,
  })

  it('serves a card derived from the runtime MCP server', async () => {
    const response = await fetch(cardRoute)
    const card = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, HEAD')
    expect(response.headers.get('cache-control')).toBe('public, max-age=900')
    expect(card).toMatchObject({
      $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
      version: '1.0',
      protocolVersion: '2025-11-25',
      serverInfo: {
        name: 'Late Toolkit Server',
        title: 'Late MCP discovery',
        version: '2.4.0',
      },
      description: 'MCP server installed by a later wrapper module.',
      documentationUrl: 'https://late-mcp.example.com/mcp-docs',
      transport: {
        type: 'streamable-http',
        endpoint: 'https://late-mcp.example.com/agent/mcp',
      },
      capabilities: {
        logging: {},
        prompts: { listChanged: true },
        resources: { listChanged: true },
        tools: { listChanged: true },
      },
      prompts: ['dynamic'],
      resources: ['dynamic'],
      tools: ['dynamic'],
      instructions: 'Read resources before calling tools.',
    })
  })

  it('mirrors live capabilities and exposes built-in definitions', async () => {
    const [cardResponse, initialize, tools, resources, pageResource, llmsTxt, devtools, seoPro] = await Promise.all([
      fetch(cardRoute).then(response => response.json()),
      mcpRequest('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'nuxt-ai-ready-test', version: '1.0.0' },
      }),
      mcpRequest('tools/list'),
      mcpRequest('resources/list'),
      mcpRequest('resources/read', { uri: 'resource://nuxt-ai-ready/pages' }),
      fetch('/llms.txt').then(response => response.text()),
      fetch('/__ai-ready__/debug.json').then(response => response.json()),
      fetch('/api/mcp-seo-state').then(response => response.json()),
    ])

    expect(cardResponse.capabilities).toEqual(initialize.result.capabilities)
    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_page_markdown',
      'list_pages',
      'search_pages',
    ])
    expect(resources.result.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ uri: 'resource://nuxt-ai-ready/pages' }),
    ]))
    expect(JSON.parse(pageResource.result.contents[0].text).pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ route: '/' }),
      expect.objectContaining({ route: '/about' }),
    ]))
    expect(llmsTxt).toContain('[MCP](https://late-mcp.example.com/agent/mcp)')
    expect(devtools.config.mcp).toEqual({
      enabled: true,
      tools: true,
      resources: true,
    })
    expect(seoPro).toEqual({ mcp: true })
  })

  it('supports HEAD without a response body', async () => {
    const response = await fetch(cardRoute, { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toBe('')
  })
})
