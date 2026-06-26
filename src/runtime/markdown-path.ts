const RE_TRAILING_SLASHES = /\/+$/

export function toMarkdownPath(path: string): string {
  if (path === '/')
    return '/index.md'
  return `${path.replace(RE_TRAILING_SLASHES, '')}.md`
}
