/**
 * Read a page's already-prerendered HTML from the static output dir.
 *
 * During prerendering the `.md` route is queued via `prerenderRoutes()` while
 * the page's HTML render is in flight, so by the time the markdown middleware
 * runs, nitro has already written the page to disk. Reusing that file avoids
 * a full second SSR render per page.
 *
 * Uses dynamic node imports so non-prerender builds never bundle node:fs.
 * Returns undefined on any miss so callers can fall back to `event.fetch`.
 */
export async function readPrerenderedHtml(outputDir: string | undefined, path: string): Promise<string | undefined> {
  if (!outputDir)
    return undefined
  try {
    const { readFile } = await import('node:fs/promises')
    const { join, resolve, sep } = await import('node:path')
    const base = resolve(outputDir)
    // Nitro writes files with `decodeURI(route)` applied; try the raw path as
    // a fallback for anything decodeURI would reject or change unexpectedly.
    const variants = new Set<string>()
    try {
      variants.add(decodeURI(path))
    }
    catch {
      // malformed escape sequence — fall through to the raw path
    }
    variants.add(path)
    for (const variant of variants) {
      const clean = variant.replace(/\/+$/, '')
      for (const file of [join(base, clean, 'index.html'), clean ? join(base, `${clean}.html`) : '']) {
        if (!file)
          continue
        // Guard against escaping the output dir (e.g. ../ segments); the
        // trailing separator prevents sibling-prefix matches like `${base}-evil`.
        const resolved = resolve(file)
        if (resolved !== base && !resolved.startsWith(base + sep))
          continue
        const html = await readFile(resolved, 'utf-8').catch(() => {
          // expected miss (ENOENT etc.) — the caller falls back to event.fetch
          return undefined
        })
        if (html)
          return html
      }
    }
  }
  catch {
    // fs unavailable or unexpected path shape — let the caller fetch instead
  }
  return undefined
}
