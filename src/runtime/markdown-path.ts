const RE_TRAILING_SLASHES = /\/+$/

export function normalizePagePath(path: string): string {
  return path.replace(RE_TRAILING_SLASHES, '') || '/'
}

export function toMarkdownPath(path: string): string {
  const normalizedPath = normalizePagePath(path)
  if (normalizedPath === '/')
    return '/index.md'
  return `${normalizedPath}.md`
}
