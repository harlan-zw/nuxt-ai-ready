function toIsoDate(value: string | Date | undefined): string {
  if (!value)
    return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/**
 * Resolve when a page's content last changed, from sources that know it.
 *
 * Returns an empty string when no source gives a valid date. The index time is
 * never a fallback: it moves on every deploy or re-index, so a sitemap lastmod
 * built from it tells crawlers every page changed, and they learn to ignore it.
 */
export function resolvePageUpdatedAt(sitemapLastmod: string | Date | undefined, metaUpdatedAt: string | undefined): string {
  return toIsoDate(metaUpdatedAt) || toIsoDate(sitemapLastmod)
}
