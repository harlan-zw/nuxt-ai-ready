const RE_FENCE = /^ {0,3}(`{3,}|~{3,})/
const RE_INLINE_ROOT_LINK = /\]\((<?)\/(?!\/)/g
const RE_REFERENCE_ROOT_LINK = /^( {0,3}\[[^\]]+\]:[\t ]*<?)\/(?!\/)/

function closesFence(line: string, fence: string): boolean {
  const trimmed = line.trim()
  return trimmed.length >= fence.length
    && trimmed[0] === fence[0]
    && [...trimmed].every(char => char === fence[0])
}

function backtickRun(line: string, start: number): number {
  let end = start
  while (line[end] === '`')
    end++
  return end - start
}

/** Code spans open and close with backtick runs of the same length. */
function rewriteOutsideCodeSpans(line: string, rewrite: (text: string) => string): string {
  let output = ''
  let last = 0
  let index = line.indexOf('`')
  while (index !== -1) {
    const length = backtickRun(line, index)
    let close = line.indexOf('`', index + length)
    while (close !== -1 && backtickRun(line, close) !== length)
      close = line.indexOf('`', close + backtickRun(line, close))
    if (close === -1) {
      index = line.indexOf('`', index + length)
      continue
    }
    output += rewrite(line.slice(last, index)) + line.slice(index, close + length)
    last = close + length
    index = line.indexOf('`', last)
  }
  return output + rewrite(line.slice(last))
}

/**
 * Resolve root-relative link and image destinations against a site origin.
 *
 * A Markdown page read on its own, by an agent or from `llms-full.txt`, has
 * no page URL to resolve `/docs/api` against, so such a link loses its
 * target. Fenced code and inline code spans keep their text.
 */
export function absoluteMarkdownLinks(markdown: string, siteUrl: string): string {
  const origin = new URL(siteUrl).origin
  let fence: string | undefined
  return markdown.split(/(?<=\n)/).map((line) => {
    if (fence) {
      if (closesFence(line, fence))
        fence = undefined
      return line
    }
    const opening = line.match(RE_FENCE)
    if (opening) {
      fence = opening[1]
      return line
    }
    return rewriteOutsideCodeSpans(line, text => text
      .replace(RE_REFERENCE_ROOT_LINK, `$1${origin}/`)
      .replace(RE_INLINE_ROOT_LINK, `]($1${origin}/`))
  }).join('')
}

/** A deployed path on the site's origin, or the path itself when no site URL is known. */
export function absoluteSiteUrl(path: string, siteUrl: string | undefined): string {
  return siteUrl ? new URL(path, new URL(siteUrl).origin).href : path
}
