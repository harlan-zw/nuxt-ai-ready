import type {
  ResolvedSiteToolsConfig,
  ResolvedWebMcpSiteToolAttachment,
  ResolvedWebMcpToolsConfig,
  SiteToolsConfig,
  WebMcpSiteToolAttachmentOptions,
} from '../runtime/site-tool-config'
import type { ModuleOptions } from '../runtime/types'
import type { ResolvedDatabase } from './database'

const DEFAULT_MAX_OUTPUT_CHARS = 1500
const DEFAULT_LIST_LIMIT = 20
const DEFAULT_SEARCH_LIMIT = 10
const MAX_TOOL_LIMIT = 50

export interface ResolvedWebMcpConfig {
  tools: ResolvedWebMcpToolsConfig
  exposedTo?: string[]
}

export interface ResolveSiteToolsConfigResult {
  config: ResolvedSiteToolsConfig
  warnings: string[]
}

export interface ResolveSiteToolsOptions {
  /**
   * Every site tool reads the page index. A disabled database has no index,
   * so the tools are detached from both MCP and WebMCP.
   */
  database?: ResolvedDatabase
}

function detachedSiteTools(): ResolvedSiteToolsConfig {
  return {
    listPages: { defaultLimit: DEFAULT_LIST_LIMIT, mcp: { enabled: false }, webmcp: { enabled: false } },
    searchPages: { defaultLimit: DEFAULT_SEARCH_LIMIT, mcp: { enabled: false }, webmcp: { enabled: false } },
    getPageMarkdown: { mcp: { enabled: false }, webmcp: { enabled: false } },
  }
}

export type ResolveWebMcpConfigResult
  = | { _tag: 'Disabled' }
    | { _tag: 'Enabled', config: ResolvedWebMcpConfig }

function parsePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
  warnings: string[],
  max?: number,
): number {
  if (value === undefined)
    return fallback

  const integer = Math.trunc(value)
  if (!Number.isFinite(value) || integer < 1) {
    warnings.push(`\`aiReady.${name}\` must be a positive finite integer. Using ${fallback}.`)
    return fallback
  }
  if (max && integer > max) {
    warnings.push(`\`aiReady.${name}\` cannot exceed ${max}. Using ${max}.`)
    return max
  }
  if (integer !== value)
    warnings.push(`\`aiReady.${name}\` must be an integer. Using ${integer}.`)
  return integer
}

function resolveWebMcpAttachment(
  options: WebMcpSiteToolAttachmentOptions | undefined,
  path: string,
  warnings: string[],
): ResolvedWebMcpSiteToolAttachment {
  if (options?.enabled === false)
    return { enabled: false }

  return {
    enabled: true,
    maxOutputChars: parsePositiveInteger(
      options?.maxOutputChars,
      DEFAULT_MAX_OUTPUT_CHARS,
      `${path}.webmcp.maxOutputChars`,
      warnings,
    ),
    exposedTo: options?.exposedTo === undefined ? undefined : [...options.exposedTo],
  }
}

export function resolveSiteToolsConfig(
  input: SiteToolsConfig | undefined,
  options: ResolveSiteToolsOptions = {},
): ResolveSiteToolsConfigResult {
  if (options.database?._tag === 'Disabled')
    return { config: detachedSiteTools(), warnings: [] }

  const warnings: string[] = []
  return {
    config: {
      listPages: {
        defaultLimit: parsePositiveInteger(
          input?.listPages?.defaultLimit,
          DEFAULT_LIST_LIMIT,
          'tools.listPages.defaultLimit',
          warnings,
          MAX_TOOL_LIMIT,
        ),
        mcp: { enabled: input?.listPages?.mcp?.enabled !== false },
        webmcp: resolveWebMcpAttachment(input?.listPages?.webmcp, 'tools.listPages', warnings),
      },
      searchPages: {
        defaultLimit: parsePositiveInteger(
          input?.searchPages?.defaultLimit,
          DEFAULT_SEARCH_LIMIT,
          'tools.searchPages.defaultLimit',
          warnings,
          MAX_TOOL_LIMIT,
        ),
        mcp: { enabled: input?.searchPages?.mcp?.enabled !== false },
        webmcp: resolveWebMcpAttachment(input?.searchPages?.webmcp, 'tools.searchPages', warnings),
      },
      getPageMarkdown: {
        mcp: { enabled: input?.getPageMarkdown?.mcp?.enabled !== false },
        webmcp: resolveWebMcpAttachment(input?.getPageMarkdown?.webmcp, 'tools.getPageMarkdown', warnings),
      },
    },
    warnings,
  }
}

export function resolveWebMcpConfig(
  input: ModuleOptions['webmcp'],
  toolsConfig: ResolvedSiteToolsConfig,
): ResolveWebMcpConfigResult {
  if (!input)
    return { _tag: 'Disabled' }

  const options = input === true ? {} : input
  const tools: ResolvedWebMcpToolsConfig = {}
  if (options.tools !== false) {
    if (toolsConfig.listPages.webmcp.enabled) {
      tools.listPages = {
        defaultLimit: toolsConfig.listPages.defaultLimit,
        maxOutputChars: toolsConfig.listPages.webmcp.maxOutputChars,
        exposedTo: toolsConfig.listPages.webmcp.exposedTo,
      }
    }
    if (toolsConfig.searchPages.webmcp.enabled) {
      tools.searchPages = {
        defaultLimit: toolsConfig.searchPages.defaultLimit,
        maxOutputChars: toolsConfig.searchPages.webmcp.maxOutputChars,
        exposedTo: toolsConfig.searchPages.webmcp.exposedTo,
      }
    }
    if (toolsConfig.getPageMarkdown.webmcp.enabled) {
      tools.getPageMarkdown = {
        maxOutputChars: toolsConfig.getPageMarkdown.webmcp.maxOutputChars,
        exposedTo: toolsConfig.getPageMarkdown.webmcp.exposedTo,
      }
    }
  }
  return {
    _tag: 'Enabled',
    config: {
      tools,
      exposedTo: options.exposedTo?.length ? [...options.exposedTo] : undefined,
    },
  }
}
