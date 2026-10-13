const INDEXED_LASTMOD_MARKER = '<!-- nuxt-ai-ready:indexed-lastmod -->'

/** Mark dates added by this module without changing the public sitemap date. */
export function markIndexedSitemapLastmods(xml: string, enrichedUrls: ReadonlySet<string>): string {
  const escapedUrls = new Set([...enrichedUrls].map(url => url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&apos;')))
  return xml.replace(/<url>([\s\S]*?)<\/url>/g, (entry: string, body: string) => {
    const loc = body.match(/<loc>([^<]*)<\/loc>/)?.[1]
    return loc && escapedUrls.has(loc)
      ? entry.replace('<lastmod>', `${INDEXED_LASTMOD_MARKER}<lastmod>`)
      : entry
  })
}

/** The source crawl must never treat our indexed date as a CMS change. */
export function stripIndexedSitemapLastmods(body: Uint8Array): Uint8Array {
  let xml: string
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(body)
  }
  catch {
    // Preserve invalid UTF-8 and compressed bytes for sitemapd to decode and report.
    return body
  }
  if (!xml.includes(INDEXED_LASTMOD_MARKER))
    return body
  return new TextEncoder().encode(xml.replace(/<!-- nuxt-ai-ready:indexed-lastmod -->\s*<lastmod>[^<]*<\/lastmod>/g, ''))
}
