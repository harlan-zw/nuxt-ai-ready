import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createMcpServerCardEtag,
  matchesMcpServerCardEtag,
  parseLatestMcpProtocolVersion,
  parseMcpServerCardConfig,
  resolveInstalledMcpProtocolVersion,
  resolveMcpServerCard,
  resolveMcpServerCardName,
  resolveMcpServerCardRoute,
} from '../../src/utils/mcp-server-card'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

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
    { description: 'x'.repeat(101) },
    { name: 'Human readable name' },
    { websiteUrl: '/docs/mcp' },
  ])('returns an error value for invalid config: %j', (config) => {
    expect(parseMcpServerCardConfig(config)).toMatchObject({ _tag: 'Invalid' })
  })
})

describe('resolveMcpServerCardName', () => {
  it('uses a validated explicit reverse-DNS name', () => {
    expect(resolveMcpServerCardName({
      overrideName: 'com.example/docs-mcp',
      route: '/agent/mcp',
      siteUrl: 'https://example.com/docs/',
    })).toEqual({ _tag: 'Resolved', name: 'com.example/docs-mcp' })
  })

  it('derives a reverse-DNS name from the deployment host and route', () => {
    expect(resolveMcpServerCardName({
      route: '/agent/mcp',
      siteUrl: 'https://mcp.docs.example.com/base/',
    })).toEqual({ _tag: 'Resolved', name: 'com.example.docs.mcp/mcp' })
  })

  it('uses a reserved reverse-DNS namespace without a site URL', () => {
    expect(resolveMcpServerCardName({ route: '/mcp' })).toEqual({
      _tag: 'Resolved',
      name: 'local.invalid/mcp',
    })
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

  it('resolves the SDK installed beside a nested Toolkit package', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'nuxt-ai-ready-mcp-'))
    temporaryDirectories.push(rootDir)
    const wrapperModulesDir = join(rootDir, 'wrapper', 'node_modules')
    const toolkitDir = join(wrapperModulesDir, '@nuxtjs', 'mcp-toolkit')
    const sdkDir = join(toolkitDir, 'node_modules', '@modelcontextprotocol', 'sdk')
    await mkdir(sdkDir, { recursive: true })
    await writeFile(join(toolkitDir, 'package.json'), JSON.stringify({
      name: '@nuxtjs/mcp-toolkit',
      exports: './module.js',
    }))
    await writeFile(join(toolkitDir, 'module.js'), '')
    await writeFile(join(sdkDir, 'package.json'), JSON.stringify({
      name: '@modelcontextprotocol/sdk',
      exports: { './types.js': './types.js' },
    }))
    await writeFile(join(sdkDir, 'types.js'), `export const LATEST_PROTOCOL_VERSION = '2026-08-04';`)

    await expect(resolveInstalledMcpProtocolVersion({
      rootDir: join(rootDir, 'consumer'),
      modulesDir: [wrapperModulesDir],
    })).resolves.toEqual({
      _tag: 'Resolved',
      protocolVersion: '2026-08-04',
    })
  })
})

describe('resolveMcpServerCard', () => {
  it('emits the current SEP-2127 Server Card shape', () => {
    expect(resolveMcpServerCard({
      protocolVersion: '2025-11-25',
      endpoint: 'https://example.com/docs/agent/mcp',
      name: 'com.example/docs-mcp',
      siteName: 'Site fallback',
      siteDescription: 'Site description',
      toolkit: {
        version: '2.4.0',
        description: 'Toolkit description',
        icons: [{ src: 'https://example.com/icon.png' }],
      },
      overrides: {
        cacheMaxAge: 900,
        title: 'Example discovery server',
        websiteUrl: 'https://example.com/docs/mcp',
      },
    })).toEqual({
      $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
      name: 'com.example/docs-mcp',
      version: '2.4.0',
      description: 'Toolkit description',
      title: 'Example discovery server',
      websiteUrl: 'https://example.com/docs/mcp',
      icons: [{ src: 'https://example.com/icon.png' }],
      remotes: [{
        type: 'streamable-http',
        url: 'https://example.com/docs/agent/mcp',
        supportedProtocolVersions: ['2025-11-25'],
      }],
    })
  })

  it('omits unusable remote metadata without an absolute deployment URL', () => {
    expect(resolveMcpServerCard({
      protocolVersion: '2025-11-25',
      endpoint: '/mcp',
      name: 'com.example/mcp',
      siteName: 'Fallback site',
      toolkit: {},
      overrides: { cacheMaxAge: 3600 },
    })).toMatchObject({
      name: 'com.example/mcp',
      version: '1.0.0',
      description: 'MCP server for Fallback site.',
    })
    expect(resolveMcpServerCard({
      protocolVersion: '2025-11-25',
      endpoint: '/mcp',
      name: 'com.example/mcp',
      toolkit: {},
      overrides: { cacheMaxAge: 3600 },
    })).not.toHaveProperty('remotes')
  })

  it('builds a stable strong ETag from the serialized card', () => {
    const card = resolveMcpServerCard({
      protocolVersion: '2025-11-25',
      endpoint: '/mcp',
      name: 'com.example/mcp',
      toolkit: {},
      overrides: { cacheMaxAge: 3600 },
    })

    expect(createMcpServerCardEtag(card)).toMatch(/^"[a-f0-9]{64}"$/)
    expect(createMcpServerCardEtag(card)).toBe(createMcpServerCardEtag(card))
  })

  it.each([
    ['"current"', true],
    ['W/"current"', true],
    ['"old", W/"current"', true],
    ['*', true],
    ['"old"', false],
    [undefined, false],
  ])('matches If-None-Match value %j', (requestHeader, expected) => {
    expect(matchesMcpServerCardEtag(requestHeader, '"current"')).toBe(expected)
  })

  it('appends the reserved suffix to the Streamable HTTP route', () => {
    expect(resolveMcpServerCardRoute('/agent/mcp/')).toBe('/agent/mcp/server-card')
  })
})
