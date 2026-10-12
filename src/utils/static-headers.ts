import { mergeVaryHeader } from '../runtime/cache-control'
import { toDeployedRoute } from '../runtime/route-path'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Add a default header to a route block without creating a duplicate block.
 * Existing header values (including explicit removals) take precedence.
 * Append mode merges list tokens; explicit removals still take precedence.
 */
export function ensureStaticHeader(
  contents: string,
  route: string,
  name: string,
  value: string,
  mode: 'default' | 'append' = 'default',
): string {
  const eol = contents.includes('\r\n') ? '\r\n' : '\n'
  const routePattern = new RegExp(`^${escapeRegExp(route)}[\\t ]*\\r?$`, 'gm')
  const routeMatches = [...contents.matchAll(routePattern)]
  const routeMatch = routeMatches.at(-1)

  if (!routeMatch || routeMatch.index === undefined) {
    const separator = contents.length === 0
      ? ''
      : contents.endsWith(`${eol}${eol}`)
        ? ''
        : contents.endsWith(eol)
          ? eol
          : `${eol}${eol}`

    return `${contents}${separator}${route}${eol}  ${name}: ${value}${eol}`
  }

  const routeLineEnd = routeMatch.index + routeMatch[0].length
  const blockStart = contents[routeLineEnd] === '\n' ? routeLineEnd + 1 : routeLineEnd
  const nextBlockPattern = /^(?![\t ]|\r?$).+/gm
  nextBlockPattern.lastIndex = blockStart
  const nextBlock = nextBlockPattern.exec(contents)
  const blockEnd = nextBlock?.index ?? contents.length
  const block = contents.slice(blockStart, blockEnd)
  const escapedName = escapeRegExp(name)
  const existingHeaderPattern = new RegExp(
    `^[\\t ]+(?:${escapedName}[\\t ]*:|![\\t ]*${escapedName}[\\t ]*\\r?$)`,
    'im',
  )

  if (existingHeaderPattern.test(block)) {
    if (mode === 'append') {
      const removalPattern = new RegExp(`^[\\t ]+![\\t ]*${escapedName}[\\t ]*\\r?$`, 'im')
      if (removalPattern.test(block))
        return contents
      const valuePattern = new RegExp(`^([\\t ]+${escapedName}[\\t ]*:[\\t ]*)([^\\r\\n]*)(\\r?$)`, 'im')
      const match = block.match(valuePattern)
      if (match) {
        const merged = block.replace(valuePattern, (_line, prefix: string, current: string, suffix: string) => {
          const appended = name.toLowerCase() === 'link'
            ? current.includes(value) ? current : [current, value].filter(Boolean).join(', ')
            : mergeVaryHeader(current, value)
          return `${prefix}${appended}${suffix}`
        })
        return `${contents.slice(0, blockStart)}${merged}${contents.slice(blockEnd)}`
      }
    }
    return contents
  }

  const prefix = blockStart === routeLineEnd ? eol : ''
  return `${contents.slice(0, blockStart)}${prefix}  ${name}: ${value}${eol}${contents.slice(blockStart)}`
}

/** Share discovery entries across static assets without multiplying page rules. */
export function mergeStaticDiscoveryHeaders(contents: string, baseURL: string, entries: readonly string[]): string {
  if (entries.length === 0)
    return contents
  const route = toDeployedRoute('/*', baseURL)
  const blocks = splitHeaderBlocks(contents)
  const matching = blocks.filter(block => block.route === route)
  let merged = matching[0]?.text || ''
  for (const block of matching.slice(1)) {
    for (const line of block.text.split(/(?<=\n)/).slice(1)) {
      const header = line.match(/^[\t ]+([^:\s]+):[\t ]*([^\r\n]*)/)
      if (header?.[1]?.toLowerCase() === 'link') {
        merged = ensureStaticHeader(merged, route, header[1], header[2]!, 'append')
      }
      else if (header) {
        const existing = new RegExp(`^[\\t ]+${escapeRegExp(header[1]!)}[\\t ]*:[^\\r\\n]*(?:\\r?\\n|$)`, 'gim')
        merged = ensureStaticHeader(merged.replace(existing, ''), route, header[1]!, header[2]!)
      }
      else {
        merged += line
      }
    }
  }
  if (matching.length > 1) {
    let inserted = false
    contents = blocks.map((block) => {
      if (block.route !== route)
        return block.text
      if (inserted)
        return ''
      inserted = true
      return merged
    }).join('')
  }
  return entries.reduce((headers, entry) => ensureStaticHeader(headers, route, 'Link', entry, 'append'), contents)
}

/** Cloudflare rejects a `_headers` file with more rules than this (code 100324). */
export const CLOUDFLARE_STATIC_HEADER_RULE_LIMIT = 100

export interface StaticHeaderBudgetResult {
  contents: string
  /** Rules left in the file. */
  total: number
  /** Exact `.md` rules removed to get under the limit. */
  dropped: number
}

const RE_EXACT_MARKDOWN_ROUTE = /^\/[^*\s]*\.md[\t ]*\r?$/

interface HeaderBlock {
  route: string | null
  text: string
}

/** Splits a `_headers` file into its rule blocks. Leading comments and blank lines form a routeless block. */
function splitHeaderBlocks(contents: string): HeaderBlock[] {
  const blocks: HeaderBlock[] = []
  let current: HeaderBlock = { route: null, text: '' }
  for (const line of contents.split(/(?<=\n)/)) {
    const isRoute = /^[^\s#]/.test(line)
    if (isRoute) {
      blocks.push(current)
      current = { route: line.trimEnd(), text: '' }
    }
    current.text += line
  }
  blocks.push(current)
  return blocks
}

/**
 * Keeps a `_headers` file under a host's rule limit.
 *
 * Exact `.md` rules are the ones this module multiplies, one per prerendered
 * page, so a site with more pages than the limit fails its whole deploy on the
 * upload. When the file is over budget those rules go first. The `/*.md` glob
 * still sets the charset and describedby entries for every markdown twin;
 * only the per-page canonical and alternate entries are lost.
 */
export function enforceStaticHeaderBudget(contents: string, limit: number): StaticHeaderBudgetResult {
  const blocks = splitHeaderBlocks(contents)
  const ruleCount = blocks.filter(block => block.route !== null).length
  if (ruleCount <= limit)
    return { contents, total: ruleCount, dropped: 0 }

  const kept = blocks.filter(block => block.route === null || !RE_EXACT_MARKDOWN_ROUTE.test(block.route))
  return {
    contents: kept.map(block => block.text).join(''),
    total: kept.filter(block => block.route !== null).length,
    dropped: ruleCount - kept.filter(block => block.route !== null).length,
  }
}
