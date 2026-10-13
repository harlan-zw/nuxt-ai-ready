interface HeaderRule {
  pattern: string
  headers: Array<[name: string, value: string]>
  removals: string[]
}

function parseHeaderRules(contents: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#'))
      continue
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [], removals: [] })
      continue
    }
    const colon = line.indexOf(':')
    const removal = line.match(/^\s+!\s*([^\s:]+)\s*$/)
    if (removal && rules.length)
      rules.at(-1)!.removals.push(removal[1]!.toLowerCase())
    const name = line.slice(0, colon).trim()
    if (colon > 0 && !name.startsWith('!') && rules.length)
      rules.at(-1)!.headers.push([name.toLowerCase(), line.slice(colon + 1).trim()])
  }
  return rules
}

function matchesPattern(pattern: string, path: string): boolean {
  if (!pattern.startsWith('/'))
    return false
  const source = pattern
    .split(/(\*|:\w+)/)
    .map(part => part === '*' ? '.*' : part.startsWith(':') ? '[^/]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('')
  return new RegExp(`^${source}$`).test(path)
}

/**
 * The headers Cloudflare static assets send for a path: every rule whose
 * pattern matches applies, and a header set by several rules is joined with
 * a comma.
 */
export function resolveCloudflareStaticHeaders(contents: string, path: string): Record<string, string> {
  const merged: Record<string, string[]> = {}
  // Local Cloudflare assets keep the last value at the first position for a repeated pattern.
  for (const rule of new Map(parseHeaderRules(contents).map(rule => [rule.pattern, rule])).values()) {
    if (!matchesPattern(rule.pattern, path))
      continue
    for (const name of rule.removals)
      delete merged[name]
    for (const [name, value] of rule.headers)
      (merged[name] ||= []).push(value)
  }
  return Object.fromEntries(Object.entries(merged).map(([name, values]) => [name, values.join(', ')]))
}

/** Values of a comma-separated header, with duplicates kept so a test can count them. */
export function headerTokens(value: string | null | undefined): string[] {
  return (value || '').split(',').map(token => token.trim()).filter(Boolean)
}
