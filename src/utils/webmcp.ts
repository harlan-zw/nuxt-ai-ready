import type { SiteToolName } from '../runtime/site-tool-catalog'
import type { ModuleOptions } from '../runtime/types'
import { SITE_TOOL_NAMES } from '../runtime/site-tool-catalog'

const DEFAULT_MAX_OUTPUT_CHARS = 1500
const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 50

export interface ResolvedWebMcpConfig {
  siteTools: SiteToolName[]
  maxOutputChars: number
  searchLimit: number
  exposedTo?: string[]
}

export type ResolveWebMcpConfigResult
  = | { _tag: 'Disabled' }
    | { _tag: 'Enabled', config: ResolvedWebMcpConfig, warnings: string[] }

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
    warnings.push(`\`webmcp.${name}\` must be a positive finite integer. Using ${fallback}.`)
    return fallback
  }
  if (max && integer > max) {
    warnings.push(`\`webmcp.${name}\` cannot exceed ${max}. Using ${max}.`)
    return max
  }
  if (integer !== value)
    warnings.push(`\`webmcp.${name}\` must be an integer. Using ${integer}.`)
  return integer
}

function resolveSiteTools(
  value: Exclude<ModuleOptions['webmcp'], boolean | undefined>['siteTools'],
  warnings: string[],
): SiteToolName[] {
  if (value === false)
    return []
  if (!Array.isArray(value))
    return [...SITE_TOOL_NAMES]

  const selected = new Set(value)
  const unknown = value.filter(name => !SITE_TOOL_NAMES.includes(name as SiteToolName))
  if (unknown.length)
    warnings.push(`Unknown \`webmcp.siteTools\`: ${unknown.join(', ')}.`)
  return SITE_TOOL_NAMES.filter(name => selected.has(name))
}

export function resolveWebMcpConfig(input: ModuleOptions['webmcp']): ResolveWebMcpConfigResult {
  if (!input)
    return { _tag: 'Disabled' }

  const options = input === true ? {} : input
  const warnings: string[] = []
  return {
    _tag: 'Enabled',
    config: {
      siteTools: resolveSiteTools(options.siteTools, warnings),
      maxOutputChars: parsePositiveInteger(
        options.maxOutputChars,
        DEFAULT_MAX_OUTPUT_CHARS,
        'maxOutputChars',
        warnings,
      ),
      searchLimit: parsePositiveInteger(
        options.searchLimit,
        DEFAULT_SEARCH_LIMIT,
        'searchLimit',
        warnings,
        MAX_SEARCH_LIMIT,
      ),
      exposedTo: options.exposedTo?.length ? [...options.exposedTo] : undefined,
    },
    warnings,
  }
}
