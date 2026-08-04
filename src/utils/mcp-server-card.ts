import type { McpServerCardConfig } from '../runtime/types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolvePackageJSON } from 'pkg-types'

export const MCP_SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json'
export const MCP_SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json'

// Keep the namespace stricter than `\w`; SEP-2127 allows `_` only after `/`.
// eslint-disable-next-line regexp/prefer-w
const MCP_SERVER_CARD_NAME_PATTERN = /^[a-z\d.-]+\/[a-z\d._-]+$/i

interface McpIcon {
  src: string
  mimeType?: string
  sizes?: string[]
  theme?: 'light' | 'dark'
}

export interface McpToolkitCardConfig {
  version?: string
  description?: string
  icons?: McpIcon[]
}

export interface McpServerCard {
  $schema: typeof MCP_SERVER_CARD_SCHEMA
  name: string
  version: string
  description: string
  title?: string
  websiteUrl?: string
  icons?: McpIcon[]
  remotes?: Array<{
    type: 'streamable-http'
    url: string
    supportedProtocolVersions: string[]
  }>
}

export type McpServerCardConfigResult
  = | { _tag: 'Disabled' }
    | { _tag: 'Enabled', config: Required<Pick<McpServerCardConfig, 'cacheMaxAge'>> & Omit<McpServerCardConfig, 'cacheMaxAge'> }
    | { _tag: 'Invalid', message: string }

export type McpProtocolVersionResult
  = | { _tag: 'Resolved', protocolVersion: string }
    | { _tag: 'Invalid', message: string }

export type McpServerCardNameResult
  = | { _tag: 'Resolved', name: string }
    | { _tag: 'Invalid', message: string }

const allowedConfigKeys = new Set([
  'cacheMaxAge',
  'description',
  'name',
  'title',
  'websiteUrl',
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

function isValidCardName(value: string): boolean {
  return value.length >= 3 && value.length <= 200 && MCP_SERVER_CARD_NAME_PATTERN.test(value)
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

  if (config.name !== undefined && (!isNonEmptyString(config.name) || !isValidCardName(config.name))) {
    return {
      _tag: 'Invalid',
      message: '`aiReady.mcpServerCard.name` must use reverse-DNS/server format.',
    }
  }

  for (const key of ['description', 'title'] as const) {
    if (config[key] !== undefined && (!isNonEmptyString(config[key]) || config[key].length > 100)) {
      return {
        _tag: 'Invalid',
        message: `\`aiReady.mcpServerCard.${key}\` must contain 1 to 100 characters.`,
      }
    }
  }

  if (config.websiteUrl !== undefined && (!isNonEmptyString(config.websiteUrl) || !isHttpUrl(config.websiteUrl))) {
    return {
      _tag: 'Invalid',
      message: '`aiReady.mcpServerCard.websiteUrl` must be an absolute HTTP(S) URL.',
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

export function resolveMcpServerCardRoute(mcpRoute: string): string {
  return `${mcpRoute.replace(/\/+$/, '') || '/mcp'}/server-card`
}

export function resolveMcpServerCardName(input: {
  overrideName?: string
  route: string
  siteUrl?: string
}): McpServerCardNameResult {
  if (input.overrideName) {
    return isValidCardName(input.overrideName)
      ? { _tag: 'Resolved', name: input.overrideName }
      : { _tag: 'Invalid', message: 'The MCP Server Card name must use reverse-DNS/server format.' }
  }

  const siteHostname = input.siteUrl && URL.canParse(input.siteUrl)
    ? new URL(input.siteUrl).hostname
    : undefined
  const hostname = siteHostname
    ? siteHostname.split('.').filter(Boolean).reverse().join('.')
    : 'local.invalid'
  const routeName = input.route
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'mcp'
  const name = `${hostname}/${routeName}`

  return isValidCardName(name)
    ? { _tag: 'Resolved', name }
    : {
        _tag: 'Invalid',
        message: 'Could not derive a valid MCP Server Card name; configure `aiReady.mcpServerCard.name`.',
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

export async function resolveInstalledMcpProtocolVersion(input: {
  rootDir: string
  modulesDir: string[]
}): Promise<McpProtocolVersionResult> {
  const resolutionBases = [...new Set([...input.modulesDir, input.rootDir])]
  const sdkResolutionAttempts = resolutionBases.map(base =>
    resolvePackageJSON('@nuxtjs/mcp-toolkit', { from: base })
      .then(toolkitPackagePath => createRequire(toolkitPackagePath).resolve('@modelcontextprotocol/sdk/types.js')),
  )
  return Promise.allSettled(sdkResolutionAttempts)
    .then((results) => {
      const resolved = results.find(result => result.status === 'fulfilled')
      if (resolved)
        return resolved.value
      throw new AggregateError(results.map(result => result.status === 'rejected' ? result.reason : undefined), 'Could not resolve the MCP Toolkit SDK.')
    })
    .then(sdkTypesPath => readFile(sdkTypesPath, 'utf8'))
    .then(parseLatestMcpProtocolVersion)
    .catch((error: unknown) => ({
      _tag: 'Invalid',
      message: `Could not resolve the MCP SDK protocol version: ${error instanceof Error ? error.message : String(error)}`,
    }))
}

function resolveDescription(input: {
  override?: string
  toolkit?: string
  site?: string
  siteName?: string
}): string {
  const candidate = input.override || input.toolkit || input.site
  if (candidate && candidate.length <= 100)
    return candidate

  const owner = input.siteName && input.siteName.length <= 75 ? input.siteName : 'this site'
  return `MCP server for ${owner}.`
}

export function resolveMcpServerCard(input: {
  protocolVersion: string
  endpoint: string
  name: string
  toolkitTitle?: string
  siteName?: string
  siteDescription?: string
  toolkit: McpToolkitCardConfig
  overrides: Required<Pick<McpServerCardConfig, 'cacheMaxAge'>> & Omit<McpServerCardConfig, 'cacheMaxAge'>
}): McpServerCard {
  const title = input.overrides.title
    || (input.toolkitTitle && input.toolkitTitle.length <= 100 ? input.toolkitTitle : undefined)
    || (input.siteName && input.siteName.length <= 100 ? input.siteName : undefined)
  const card: McpServerCard = {
    $schema: MCP_SERVER_CARD_SCHEMA,
    name: input.name,
    version: input.toolkit.version && input.toolkit.version.length <= 255
      ? input.toolkit.version
      : '1.0.0',
    description: resolveDescription({
      override: input.overrides.description,
      toolkit: input.toolkit.description,
      site: input.siteDescription,
      siteName: input.siteName,
    }),
  }

  if (URL.canParse(input.endpoint) && ['http:', 'https:'].includes(new URL(input.endpoint).protocol)) {
    card.remotes = [{
      type: 'streamable-http',
      url: input.endpoint,
      supportedProtocolVersions: [input.protocolVersion],
    }]
  }

  if (title)
    card.title = title
  if (input.overrides.websiteUrl)
    card.websiteUrl = input.overrides.websiteUrl
  const icons = input.toolkit.icons
    ?.map(icon => URL.canParse(icon.src)
      ? icon
      : (URL.canParse(input.endpoint) && URL.canParse(icon.src, input.endpoint))
          ? { ...icon, src: new URL(icon.src, input.endpoint).href }
          : undefined)
    .filter((icon): icon is McpIcon => !!icon)
  if (icons?.length)
    card.icons = icons

  return card
}

export function createMcpServerCardEtag(card: McpServerCard): string {
  return `"${createHash('sha256').update(JSON.stringify(card)).digest('hex')}"`
}

export function matchesMcpServerCardEtag(requestHeader: string | undefined, etag: string): boolean {
  if (!requestHeader)
    return false

  return requestHeader.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, '')
    return normalized === '*' || normalized === etag
  })
}
