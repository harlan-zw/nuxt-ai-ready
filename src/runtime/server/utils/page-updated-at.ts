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

export interface StoredPageDate {
  contentHash: string | null
  updatedAt: string
  source: 'prerender' | 'runtime'
}

export interface IndexedUpdatedAtInput {
  /** Date the page declares itself, already resolved. Empty when none. */
  declared: string
  /** The row before this index, if any. */
  previous: StoredPageDate | undefined
  contentHash: string
  now: Date
  /** Only true when runtime indexing runs, so two indexes can be compared. */
  detectDrift: boolean
}

/**
 * Date a runtime-indexed page. A declared date always wins. Otherwise a page
 * gets the detection time only when its body hash differs from an earlier
 * runtime index of the same page. A prerender hash comes from another pipeline,
 * so a difference there proves nothing and never produces a date.
 */
export function resolveIndexedUpdatedAt(input: IndexedUpdatedAtInput): string {
  if (input.declared)
    return input.declared
  if (!input.detectDrift)
    return ''
  const { previous } = input
  if (!previous?.contentHash)
    return ''
  if (previous.source === 'runtime' && previous.contentHash !== input.contentHash)
    return input.now.toISOString()
  return previous.updatedAt
}
