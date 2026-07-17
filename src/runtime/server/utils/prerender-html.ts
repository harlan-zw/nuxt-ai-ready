/**
 * In-memory handover of rendered HTML from a page's SSR render to its `.md`
 * twin during prerendering.
 *
 * The `.md` route is queued via `prerenderRoutes()` while the page's own HTML
 * render is in flight, so the page always renders before its `.md` twin is
 * processed. The html-capture plugin stores the rendered HTML here and the
 * markdown prerender middleware consumes it, avoiding a full second SSR render
 * per page (see nuxt/nuxt#35590).
 *
 * Entries are deleted on consume; the few that are never consumed (error/noSSR
 * pages get no `.md` twin) live only for the prerender process lifetime.
 */
const htmlByPath = new Map<string, string>()

// Match the key derivation of getMarkdownRenderInfo/toMarkdownPath: `/about/`
// renders `/about.md`, whose page path resolves to `/about`.
function normalizeHtmlCachePath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

export function storePrerenderedHtml(path: string, html: string): void {
  htmlByPath.set(normalizeHtmlCachePath(path), html)
}

export function consumePrerenderedHtml(path: string): string | undefined {
  const key = normalizeHtmlCachePath(path)
  const html = htmlByPath.get(key)
  htmlByPath.delete(key)
  return html
}
