/**
 * Shared `Cache-Control` for public AI-ready endpoints.
 *
 * Freshness goes in `max-age` only. Cloudflare disables stale serving when
 * `s-maxage` is present, so `stale-while-revalidate` would never apply at
 * the edge.
 */
export function publicCacheControl(maxAgeSeconds: number, staleSeconds: number): string {
  return staleSeconds > 0
    ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleSeconds}`
    : `public, max-age=${maxAgeSeconds}`
}

/** Merge Vary tokens without removing cache dimensions or duplicating names. */
export function mergeVaryHeader(current: string | undefined, added: string): string {
  const tokens = [...(current || '').split(','), ...added.split(',')]
    .map(token => token.trim())
    .filter(Boolean)
  if (tokens.includes('*'))
    return '*'
  const unique = new Map<string, string>()
  for (const token of tokens) {
    if (!unique.has(token.toLowerCase()))
      unique.set(token.toLowerCase(), token)
  }
  return [...unique.values()].join(', ')
}
