const RE_TRAILING_SLASHES = /\/+$/
const RE_RESERVED_PATH = /^\/(?:api(?:\/|$)|_|@)/

/** True for the `/api` namespace and Nitro's `/_*` and `/@*` internal paths. */
export function isReservedPath(path: string): boolean {
  return RE_RESERVED_PATH.test(path)
}

export function normalizePagePath(path: string): string {
  return path.replace(RE_TRAILING_SLASHES, '') || '/'
}

export function toMarkdownPath(path: string): string {
  const normalizedPath = normalizePagePath(path)
  if (normalizedPath === '/')
    return '/index.md'
  return `${normalizedPath}.md`
}
