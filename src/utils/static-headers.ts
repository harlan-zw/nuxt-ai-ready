function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Add a default header to a route block without creating a duplicate block.
 * Existing header values (including explicit removals) take precedence.
 */
export function ensureStaticHeader(
  contents: string,
  route: string,
  name: string,
  value: string,
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
    return contents
  }

  const prefix = blockStart === routeLineEnd ? eol : ''
  return `${contents.slice(0, blockStart)}${prefix}  ${name}: ${value}${eol}${contents.slice(blockStart)}`
}
