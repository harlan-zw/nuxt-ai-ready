import { describe, expect, it } from 'vitest'
import { parseLatestMcpProtocolVersion, parseMcpServerCardConfig, resolveMcpServerCard } from '../../src/utils/mcp-server-card'

describe('parseMcpServerCardConfig', () => {
  it('keeps automatic discovery enabled by default', () => {
    expect(parseMcpServerCardConfig(undefined)).toEqual({
      _tag: 'Enabled',
      config: { cacheMaxAge: 3600 },
    })
  })

  it('supports an explicit disabled state', () => {
    expect(parseMcpServerCardConfig(false)).toEqual({ _tag: 'Disabled' })
  })

  it.each([
    true,
    { cacheMaxAge: -1 },
    { description: '' },
    { iconUrl: '/icon.svg' },
  ])('returns an error value for invalid config: %j', (config) => {
    expect(parseMcpServerCardConfig(config)).toMatchObject({ _tag: 'Invalid' })
  })
})

describe('parseLatestMcpProtocolVersion', () => {
  it('reads the exact MCP SDK protocol version', () => {
    expect(parseLatestMcpProtocolVersion(`export const LATEST_PROTOCOL_VERSION = '2025-11-25';`)).toEqual({
      _tag: 'Resolved',
      protocolVersion: '2025-11-25',
    })
  })

  it('returns an error value when the SDK format is unknown', () => {
    expect(parseLatestMcpProtocolVersion('export const VERSION = 1')).toMatchObject({ _tag: 'Invalid' })
  })
})

describe('resolveMcpServerCard', () => {
  it('derives connection and identity fields from the live Toolkit config', () => {
    expect(resolveMcpServerCard({
      protocolVersion: '2025-11-25',
      siteUrl: 'https://example.com/docs/',
      siteName: 'Site fallback',
      siteDescription: 'Site description',
      toolkit: {
        route: '/agent/mcp',
        name: 'Example MCP',
        version: '2.4.0',
        description: 'Toolkit description',
        instructions: 'Use read operations first.',
        icons: [{ src: 'https://example.com/icon.png' }],
      },
      overrides: {
        cacheMaxAge: 900,
        title: 'Example discovery server',
        documentationUrl: 'https://example.com/docs/mcp',
      },
    })).toEqual({
      $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
      version: '1.0',
      protocolVersion: '2025-11-25',
      serverInfo: {
        name: 'Example MCP',
        title: 'Example discovery server',
        version: '2.4.0',
      },
      description: 'Toolkit description',
      iconUrl: 'https://example.com/icon.png',
      documentationUrl: 'https://example.com/docs/mcp',
      transport: {
        type: 'streamable-http',
        endpoint: 'https://example.com/docs/agent/mcp',
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
      instructions: 'Use read operations first.',
    })
  })

  it('uses stable Toolkit defaults without inventing optional metadata', () => {
    expect(resolveMcpServerCard({
      protocolVersion: '2025-11-25',
      siteName: 'Fallback site',
      toolkit: {},
      overrides: { cacheMaxAge: 3600 },
    })).toMatchObject({
      serverInfo: { name: 'Fallback site', version: '1.0.0' },
      transport: { endpoint: '/mcp' },
    })
  })
})
