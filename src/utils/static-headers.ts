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

interface HeaderLine {
  name: string
  value: string
  /** The same line with a new value, keeping its indentation and line ending. */
  withValue: (value: string) => string
}

/** Parse an indented `Name: value` line. Detach (`! Name`) lines are not headers. */
function parseHeaderLine(line: string): HeaderLine | undefined {
  const colon = line.indexOf(':')
  if (!/^[\t ]/.test(line) || colon < 0)
    return undefined
  const name = line.slice(0, colon).trim()
  if (!name || name.startsWith('!') || /\s/.test(name))
    return undefined
  const eol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : ''
  return {
    name,
    value: line.slice(colon + 1, line.length - eol.length).trim(),
    withValue: value => `${line.slice(0, colon + 1)} ${value}${eol}`,
  }
}

const RE_DETACH_LINE = /^[\t ]+![\t ]*([^\s:]+)/

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(/(\*|:\w+)/)
    .map(part => part === '*' ? '.*' : part.startsWith(':') ? '[^/]+' : escapeRegExp(part))
    .join('')
  return new RegExp(`^${source}$`)
}

/**
 * Whether every path `narrow` matches is also matched by `broad`. Only path
 * patterns are compared; anything this cannot prove returns false.
 */
function coversPattern(broad: string, narrow: string): boolean {
  if (broad === narrow || !broad.startsWith('/') || !narrow.startsWith('/'))
    return false
  if (!/[*:]/.test(narrow))
    return patternToRegExp(broad).test(narrow)
  return broad.indexOf('*') === broad.length - 1
    && !broad.includes(':')
    && narrow.startsWith(broad.slice(0, -1))
}

/** Split a Link value into entries, ignoring commas inside `<...>` and quotes. */
function splitLinkEntries(value: string): string[] {
  const entries: string[] = []
  let current = ''
  let inUrl = false
  let inQuote = false
  for (const char of value) {
    if (char === '<' && !inQuote)
      inUrl = true
    else if (char === '>' && !inQuote)
      inUrl = false
    else if (char === '"' && !inUrl)
      inQuote = !inQuote
    if (char === ',' && !inUrl && !inQuote) {
      entries.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  entries.push(current.trim())
  return entries.filter(Boolean)
}

function headerTokens(name: string, value: string): string[] {
  if (name === 'link')
    return splitLinkEntries(value)
  if (name === 'vary')
    return value.split(',').map(token => token.trim()).filter(Boolean)
  return [value.trim()]
}

function tokenKey(name: string, token: string): string {
  return name === 'vary' ? token.toLowerCase() : token
}

/**
 * Remove values of the named headers that a broader rule already sends.
 *
 * Cloudflare applies every `_headers` rule whose pattern matches a request and
 * joins a header set by several rules with a comma. A value repeated on
 * `/index.md`, `/*.md` and `/*` therefore reaches the client once per rule:
 * `text/markdown; charset=utf-8, text/markdown; charset=utf-8`. The broadest
 * rule keeps each value and narrower rules drop it, so every path gets it
 * once. Rules with the same pattern and detached (`! Name`) headers are left
 * alone, and a rule left without headers is removed.
 */
export function dedupeStaticHeaders(contents: string, names: readonly string[]): string {
  const owned = new Set(names.map(name => name.toLowerCase()))
  const blocks = splitHeaderBlocks(contents)
  const detached = new Set<string>()
  const parsed = blocks.map((block) => {
    const headers: Array<{ name: string, tokens: string[] }> = []
    for (const line of block.text.split(/(?<=\n)/).slice(block.route === null ? 0 : 1)) {
      const detach = line.match(RE_DETACH_LINE)
      if (detach) {
        detached.add(detach[1]!.toLowerCase())
        continue
      }
      const header = parseHeaderLine(line)
      if (!header)
        continue
      const name = header.name.toLowerCase()
      if (owned.has(name))
        headers.push({ name, tokens: headerTokens(name, header.value) })
    }
    return headers
  })

  // Local Cloudflare previews keep only the last rule for a repeated pattern,
  // so only that rule may stand in for a narrower one.
  const lastRuleIndex = new Map<string, number>()
  blocks.forEach((block, index) => {
    if (block.route !== null)
      lastRuleIndex.set(block.route, index)
  })

  let changed = false
  const output = blocks.map((block) => {
    const route = block.route
    if (route === null)
      return block.text
    const provided = new Map<string, Set<string>>()
    lastRuleIndex.forEach((index, pattern) => {
      if (!coversPattern(pattern, route))
        return
      for (const { name, tokens } of parsed[index]!) {
        if (detached.has(name))
          continue
        const values = provided.get(name) ?? new Set<string>()
        tokens.forEach(token => values.add(tokenKey(name, token)))
        provided.set(name, values)
      }
    })
    if (provided.size === 0)
      return block.text

    const [routeLine, ...lines] = block.text.split(/(?<=\n)/)
    let headerLines = 0
    const kept = lines.flatMap((line) => {
      const header = parseHeaderLine(line)
      if (!header) {
        if (RE_DETACH_LINE.test(line))
          headerLines++
        return [line]
      }
      headerLines++
      const name = header.name.toLowerCase()
      const covered = provided.get(name)
      if (!covered)
        return [line]
      const tokens = headerTokens(name, header.value)
      const remaining = tokens.filter(token => !covered.has(tokenKey(name, token)))
      if (remaining.length === tokens.length)
        return [line]
      changed = true
      if (remaining.length > 0)
        return [header.withValue(remaining.join(', '))]
      headerLines--
      return []
    })
    // Comments and blank lines stay; a rule without headers does not.
    return headerLines === 0 ? kept.join('') : `${routeLine}${kept.join('')}`
  })
  return changed ? output.join('') : contents
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
