import type { AiReadyDatabaseEvent } from '../db/context'
import { withBase } from 'ufo'
import { localFetch, useRuntimeConfig } from '#nuxtseo/nitro'
import { DB_CONTEXT_KEY, DB_PROMISE_CONTEXT_KEY, DB_WORK_CONTEXT_KEY } from '../db/context'

const FETCH_TIMEOUT = 5000
const RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

function unavailablePublicAsset(_error: unknown): null {
  // Missing assets and self-fetch failures are expected here. Callers turn null
  // into a domain-specific skip, warning, or retry.
  return null
}

export interface CloudflareEnv {
  ASSETS?: { fetch: (req: Request | string) => Promise<Response> }
}

/**
 * Get Cloudflare environment from event context or globalThis.__env__ (for scheduled tasks)
 */
export function getCfEnv(event?: AiReadyDatabaseEvent): CloudflareEnv | undefined {
  const cloudflare = event?.context.cloudflare as { env?: CloudflareEnv } | undefined
  return (cloudflare?.env
    ?? (globalThis as any).__env__) as CloudflareEnv | undefined
}

/**
 * Check if Cloudflare ASSETS binding is available
 */
export function hasAssets(event?: AiReadyDatabaseEvent): boolean {
  return !!getCfEnv(event)?.ASSETS?.fetch
}

/**
 * Fetch a public asset, preferring Cloudflare ASSETS binding when available.
 * Falls back to Nitro localFetch with a timeout for unavailable assets.
 */
export async function fetchPublicAsset<T = unknown>(
  event: AiReadyDatabaseEvent | undefined,
  path: string,
  options?: { responseType?: 'json' | 'text' | 'arrayBuffer' | 'stream' },
): Promise<T | null> {
  const responseType = options?.responseType ?? 'json'
  const cfEnv = getCfEnv(event)

  // Try Cloudflare ASSETS binding first
  if (cfEnv?.ASSETS?.fetch) {
    const response = await cfEnv.ASSETS.fetch(
      new Request(`https://assets.local${path}`),
    ).catch(unavailablePublicAsset)

    if (response?.ok) {
      if (responseType === 'json')
        return response.json().catch(unavailablePublicAsset)
      if (responseType === 'text')
        return response.text().catch(unavailablePublicAsset) as T
      if (responseType === 'arrayBuffer')
        return response.arrayBuffer().catch(unavailablePublicAsset) as T
      if (responseType === 'stream')
        return response.body as T | null
    }
    // ASSETS exists but file not found - don't fall back
    return null
  }

  // Bound internal requests when the deployment has no ASSETS binding.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  const assetContext = event && Object.fromEntries(
    Object.entries(event.context).filter(([key]) => ![DB_CONTEXT_KEY, DB_PROMISE_CONTEXT_KEY, DB_WORK_CONTEXT_KEY].includes(key)),
  )

  // A self-fetch outside the app base URL gets a redirect page, not the asset.
  return (async (): Promise<T | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      // A nested response owns its cleanup. Preserve bindings, but keep the
      // parent request's database resources out of the nested context.
      const response = await localFetch(withBase(path, useRuntimeConfig().app.baseURL), {
        signal: controller.signal,
      }, assetContext).catch(unavailablePublicAsset)
      if (attempt === 0 && !controller.signal.aborted && (!response || RETRY_STATUSES.has(response.status))) {
        await response?.body?.cancel().catch(unavailablePublicAsset)
        continue
      }
      if (!response?.ok) {
        await response?.body?.cancel().catch(unavailablePublicAsset)
        return null
      }
      if (responseType === 'stream')
        return response.body as T | null
      if (responseType === 'text')
        return response.text().catch(unavailablePublicAsset) as Promise<T | null>
      if (responseType === 'arrayBuffer')
        return response.arrayBuffer().catch(unavailablePublicAsset) as Promise<T | null>
      return response.json().catch(unavailablePublicAsset)
    }
    return null
  })().finally(() => clearTimeout(timeout))
}
