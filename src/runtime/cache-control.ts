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
