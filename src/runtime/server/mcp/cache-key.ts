import { hash } from 'ohash'

/**
 * Cache key for a site tool call: a digest of its parsed arguments.
 * Each argument set gets its own entry, and every key has one length.
 */
export function siteToolCacheKey(args: unknown): string {
  return hash(args)
}
