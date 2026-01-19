import type { H3Event } from 'h3'

const FETCH_TIMEOUT = 5000

export interface CloudflareEnv {
  ASSETS?: { fetch: (req: Request | string) => Promise<Response> }
}

/**
 * Get Cloudflare environment from event context or globalThis.__env__ (for scheduled tasks)
 */
export function getCfEnv(event?: H3Event): CloudflareEnv | undefined {
  return (event?.context?.cloudflare?.env
    ?? (globalThis as any).__env__) as CloudflareEnv | undefined
}

/**
 * Check if Cloudflare ASSETS binding is available
 */
export function hasAssets(event?: H3Event): boolean {
  return !!getCfEnv(event)?.ASSETS?.fetch
}

/**
 * Fetch a public asset, preferring Cloudflare ASSETS binding when available.
 * Falls back to $fetch with timeout to avoid self-fetch hangs on CF Workers.
 */
export async function fetchPublicAsset<T = unknown>(
  event: H3Event | undefined,
  path: string,
  options?: { responseType?: 'json' | 'text' | 'arrayBuffer' },
): Promise<T | null> {
  const responseType = options?.responseType ?? 'json'
  const cfEnv = getCfEnv(event)

  // Try Cloudflare ASSETS binding first
  if (cfEnv?.ASSETS?.fetch) {
    const response = await cfEnv.ASSETS.fetch(
      new Request(`https://assets.local${path}`),
    ).catch(() => null)

    if (response?.ok) {
      if (responseType === 'json')
        return response.json().catch(() => null)
      if (responseType === 'text')
        return response.text().catch(() => null) as T
      if (responseType === 'arrayBuffer')
        return response.arrayBuffer().catch(() => null) as T
    }
    // ASSETS exists but file not found - don't fall back
    return null
  }

  // Fallback to $fetch with timeout (self-fetch hangs on CF Workers without ASSETS)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  return globalThis.$fetch(path, {
    baseURL: '/',
    signal: controller.signal,
    responseType: responseType === 'arrayBuffer' ? 'arrayBuffer' : undefined,
  })
    .catch(() => null)
    .finally(() => clearTimeout(timeout)) as Promise<T | null>
}
