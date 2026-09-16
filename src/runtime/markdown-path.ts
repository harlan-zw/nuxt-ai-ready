const RE_TRAILING_SLASHES = /\/+$/

/**
 * Nitro's `/_*` and `/api` namespaces, plus Vite's dev-server internals.
 *
 * The `@` group names each Vite prefix rather than all of `/@`. A bare `/@`
 * also matches a profile namespace such as `/@login`, which Mastodon, Bluesky
 * and skilld.dev all use for their most agent-facing pages. Reserving those
 * left every profile page advertising a `.md` sibling that the markdown
 * handler then refused to serve.
 */
const RE_RESERVED_PATH = /^\/(?:api(?:\/|$)|_|@(?:id|fs|vite|react-refresh)(?:\/|$))/

/** True for the `/api` namespace, Nitro's `/_*` paths, and Vite's `/@*` internals. */
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

/**
 * The `.md` sibling a page may advertise, or null when it has none.
 *
 * Advertising and serving read the same predicate here, so a page cannot link
 * a representation the markdown handler declines.
 */
export function markdownAlternatePath(path: string): string | null {
  if (isReservedPath(path))
    return null
  const lastSegment = normalizePagePath(path).split('/').pop() || ''
  if (lastSegment.includes('.'))
    return null
  return toMarkdownPath(path)
}
