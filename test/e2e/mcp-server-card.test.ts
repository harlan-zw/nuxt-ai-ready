import { createResolver } from '@nuxt/kit'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)
const cardRoute = '/docs/agent/mcp/server-card'

async function mcpRequest(method: string, params?: Record<string, unknown>) {
  const response = await fetch('/docs/agent/mcp', {
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
    expect(response.headers.get('content-type')).toContain('application/mcp-server-card+json')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, HEAD')
    expect(response.headers.get('cache-control')).toBe('public, max-age=900')
    expect(card).toMatchObject({
      $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
      name: 'com.example.late-mcp/ai-ready',
      version: '2.4.0',
      description: 'MCP server installed by a later wrapper module.',
      title: 'Late MCP discovery',
      websiteUrl: 'https://late-mcp.example.com/mcp-docs',
      remotes: [{
        type: 'streamable-http',
        url: 'https://late-mcp.example.com/docs/agent/mcp',
        supportedProtocolVersions: ['2025-11-25'],
      }],
    })
  })

  it('matches live identity and exposes built-in definitions', async () => {
    const initialize = await mcpRequest('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'nuxt-ai-ready-test', version: '1.0.0' },
    })
    const [cardResponse, tools, resources, llmsTxt, sitemap, devtools, seoPro] = await Promise.all([
      fetch(cardRoute).then(response => response.json()),
      mcpRequest('tools/list'),
      mcpRequest('resources/list'),
      fetch('/llms.txt').then(response => response.text()),
      fetch('/sitemap.xml').then(response => response.text()),
      fetch('/__ai-ready__/debug.json').then(response => response.json()),
      fetch('/api/mcp-seo-state').then(response => response.json()),
    ])

    expect(cardResponse.name).toBe(initialize.result.serverInfo.name)
    expect(cardResponse.version).toBe(initialize.result.serverInfo.version)
    expect(cardResponse.remotes[0].supportedProtocolVersions).toContain(initialize.result.protocolVersion)
    expect(tools.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_page_markdown',
      'list_pages',
      'search_pages',
    ])
    expect(resources.result.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ uri: 'resource://nuxt-ai-ready/pages' }),
    ]))
    expect(llmsTxt).toContain('[MCP](https://late-mcp.example.com/docs/agent/mcp)')
    expect(sitemap).not.toContain('/agent/mcp/server-card')
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
    expect(response.headers.get('content-type')).toContain('application/mcp-server-card+json')
    expect(await response.text()).toBe('')
  })

  it('supports conditional requests with a strong ETag', async () => {
    const first = await fetch(cardRoute)
    const etag = first.headers.get('etag')
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    expect(first.headers.get('access-control-allow-headers')).toContain('If-None-Match')
    expect(first.headers.get('access-control-expose-headers')).toBe('ETag')

    const second = await fetch(cardRoute, {
      headers: { 'if-none-match': etag! },
    })
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
  })

  it('advertises the late MCP server through the API catalog', async () => {
    const [catalogResponse, homeResponse] = await Promise.all([
      fetch('/.well-known/api-catalog'),
      fetch('/'),
    ])

    expect(catalogResponse.status).toBe(200)
    await expect(catalogResponse.json()).resolves.toEqual({
      linkset: [{
        'anchor': 'https://late-mcp.example.com/docs/agent/mcp',
        'item': [{
          href: 'https://late-mcp.example.com/docs/agent/mcp',
          type: 'application/json',
        }],
        'service-desc': [{
          href: 'https://late-mcp.example.com/docs/agent/mcp/server-card',
          type: 'application/mcp-server-card+json',
        }],
      }],
    })
    expect(homeResponse.headers.get('link')).toContain('rel="api-catalog"')
  })
})
