import type { McpServerCardConfig } from '../runtime/types'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolvePackageJSON } from 'pkg-types'
import { joinURL } from 'ufo'

export const MCP_SERVER_CARD_ROUTE = '/.well-known/mcp/server-card.json'
export const MCP_SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json'

interface McpIcon {
  src: string
  mimeType?: string
  sizes?: string[]
  theme?: 'light' | 'dark'
}

export interface McpToolkitCardConfig {
  route?: string
  name?: string
  version?: string
  description?: string
  instructions?: string
  icons?: McpIcon[]
}

export interface McpServerCard {
  $schema: typeof MCP_SERVER_CARD_SCHEMA
  version: '1.0'
  protocolVersion: string
  serverInfo: {
    name: string
    title?: string
    version: string
  }
  description?: string
  iconUrl?: string
  documentationUrl?: string
  transport: {
    type: 'streamable-http'
    endpoint: string
  }
  capabilities: {
    logging: Record<string, never>
    prompts: { listChanged: true }
    resources: { listChanged: true }
    tools: { listChanged: true }
  }
  prompts: ['dynamic']
  resources: ['dynamic']
  tools: ['dynamic']
  instructions?: string
}

export type McpServerCardConfigResult
  = | { _tag: 'Disabled' }
    | { _tag: 'Enabled', config: Required<Pick<McpServerCardConfig, 'cacheMaxAge'>> & Omit<McpServerCardConfig, 'cacheMaxAge'> }
    | { _tag: 'Invalid', message: string }

export type McpProtocolVersionResult
  = | { _tag: 'Resolved', protocolVersion: string }
    | { _tag: 'Invalid', message: string }

const allowedConfigKeys = new Set([
  'cacheMaxAge',
  'description',
  'documentationUrl',
  'iconUrl',
  'instructions',
  'title',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isHttpUrl(value: string): boolean {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol)
}

export function parseMcpServerCardConfig(input: unknown): McpServerCardConfigResult {
  if (input === false)
    return { _tag: 'Disabled' }

  if (input !== undefined && !isRecord(input)) {
    return {
      _tag: 'Invalid',
      message: '`aiReady.mcpServerCard` must be false or an options object.',
    }
  }

  const config = input || {}
  const unknownKeys = Object.keys(config).filter(key => !allowedConfigKeys.has(key))
  if (unknownKeys.length) {
    return {
      _tag: 'Invalid',
      message: `Unknown \`aiReady.mcpServerCard\` option(s): ${unknownKeys.join(', ')}.`,
    }
  }

  for (const key of ['description', 'instructions', 'title'] as const) {
    if (config[key] !== undefined && !isNonEmptyString(config[key])) {
      return {
        _tag: 'Invalid',
        message: `\`aiReady.mcpServerCard.${key}\` must be a non-empty string.`,
      }
    }
  }

  for (const key of ['documentationUrl', 'iconUrl'] as const) {
    if (config[key] !== undefined && (!isNonEmptyString(config[key]) || !isHttpUrl(config[key]))) {
      return {
        _tag: 'Invalid',
        message: `\`aiReady.mcpServerCard.${key}\` must be an absolute HTTP(S) URL.`,
      }
    }
  }

  if (config.cacheMaxAge !== undefined && (typeof config.cacheMaxAge !== 'number' || !Number.isInteger(config.cacheMaxAge) || config.cacheMaxAge < 0)) {
    return {
      _tag: 'Invalid',
      message: '`aiReady.mcpServerCard.cacheMaxAge` must be a non-negative integer.',
    }
  }

  return {
    _tag: 'Enabled',
    config: {
      ...config,
      cacheMaxAge: config.cacheMaxAge ?? 3600,
    } as Required<Pick<McpServerCardConfig, 'cacheMaxAge'>> & Omit<McpServerCardConfig, 'cacheMaxAge'>,
  }
}

export function parseLatestMcpProtocolVersion(source: string): McpProtocolVersionResult {
  const match = source.match(/LATEST_PROTOCOL_VERSION\s*=\s*['"]([^'"]+)['"]/)
  if (!match?.[1]) {
    return {
      _tag: 'Invalid',
      message: 'Could not read LATEST_PROTOCOL_VERSION from the installed MCP SDK.',
    }
  }
  return { _tag: 'Resolved', protocolVersion: match[1] }
}

export async function resolveInstalledMcpProtocolVersion(rootDir: string): Promise<McpProtocolVersionResult> {
  const toolkitPackagePath = await resolvePackageJSON('@nuxtjs/mcp-toolkit', { from: rootDir })
  const sdkTypesPath = createRequire(toolkitPackagePath).resolve('@modelcontextprotocol/sdk/types.js')
  const source = await readFile(sdkTypesPath, 'utf8')
  return parseLatestMcpProtocolVersion(source)
}

export function resolveMcpServerCard(input: {
  protocolVersion: string
  siteUrl?: string
  siteName?: string
  siteDescription?: string
  toolkit: McpToolkitCardConfig
  overrides: Required<Pick<McpServerCardConfig, 'cacheMaxAge'>> & Omit<McpServerCardConfig, 'cacheMaxAge'>
}): McpServerCard {
  const route = input.toolkit.route || '/mcp'
  const serverInfo: McpServerCard['serverInfo'] = {
    name: input.toolkit.name || input.siteName || 'MCP Server',
    version: input.toolkit.version || '1.0.0',
  }
  if (input.overrides.title)
    serverInfo.title = input.overrides.title

  const card: McpServerCard = {
    $schema: MCP_SERVER_CARD_SCHEMA,
    version: '1.0',
    protocolVersion: input.protocolVersion,
    serverInfo,
    transport: {
      type: 'streamable-http',
      endpoint: input.siteUrl ? joinURL(input.siteUrl, route) : route,
    },
    // MCP Toolkit registers all four handlers, including empty-list fallbacks,
    // so these match its initialization response without advertising primitives.
    capabilities: {
      logging: {},
      prompts: { listChanged: true },
      resources: { listChanged: true },
      tools: { listChanged: true },
    },
    prompts: ['dynamic'],
    resources: ['dynamic'],
    tools: ['dynamic'],
  }

  const description = input.overrides.description || input.toolkit.description || input.siteDescription
  const iconUrl = input.overrides.iconUrl || input.toolkit.icons?.[0]?.src
  const instructions = input.overrides.instructions || input.toolkit.instructions
  if (description)
    card.description = description
  if (iconUrl)
    card.iconUrl = iconUrl
  if (input.overrides.documentationUrl)
    card.documentationUrl = input.overrides.documentationUrl
  if (instructions)
    card.instructions = instructions

  return card
}
