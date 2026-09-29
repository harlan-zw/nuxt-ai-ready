const RE_TRAILING_SLASHES = /\/+$/
// A file extension starts with a letter: `.png`, `.avif`, `.md`. The `.2` in
// `/v1.2` does not, so that segment names a page.
const RE_FILE_EXTENSION = /\.[a-z][a-z\d]*$/i

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
 * True when a path names a page with a `.md` twin: outside the reserved
 * namespaces, and not a file such as `/feed.xml`. A dot alone does not make a
 * file, so `/v1.2` is a page.
 *
 * Prerendering and every advertisement read this one predicate, so a page
 * cannot link a representation the build or the markdown handler lacks.
 */
export function hasMarkdownTwin(path: string): boolean {
  const lastSegment = normalizePagePath(path).split('/').pop() || ''
  return !isReservedPath(path) && !RE_FILE_EXTENSION.test(lastSegment)
}

/** The `.md` sibling a page may advertise, or null when it has none. */
export function markdownAlternatePath(path: string): string | null {
  return hasMarkdownTwin(path) ? toMarkdownPath(path) : null
}
