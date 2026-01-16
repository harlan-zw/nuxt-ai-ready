/**
 * Shared IndexNow utilities for build-time and runtime
 * This module has no Nuxt/Nitro dependencies so it can be used in both contexts
 */

// Endpoints to try in order (fallback on 429)
// Can be overridden via INDEXNOW_TEST_ENDPOINT env var for testing
export const INDEXNOW_HOSTS = ['api.indexnow.org', 'www.bing.com']

/**
 * Get IndexNow endpoints, with test override support
 */
export function getIndexNowEndpoints(): string[] {
  const testEndpoint = process.env.INDEXNOW_TEST_ENDPOINT
  if (testEndpoint) {
    return [testEndpoint]
  }
  return INDEXNOW_HOSTS.map(host => `https://${host}/indexnow`)
}

export interface IndexNowSubmitResult {
  success: boolean
  error?: string
  host?: string
}

export interface IndexNowRequestBody {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

/**
 * Build the IndexNow API request body
 */
export function buildIndexNowBody(
  routes: string[],
  key: string,
  siteUrl: string,
): IndexNowRequestBody {
  // Convert routes to absolute URLs
  const urlList = routes.map(route =>
    route.startsWith('http') ? route : `${siteUrl}${route}`,
  )

  return {
    host: new URL(siteUrl).host,
    key,
    keyLocation: `${siteUrl}/${key}.txt`,
    urlList,
  }
}

export interface SubmitOptions {
  /** Custom fetch implementation (defaults to globalThis.fetch) */
  fetchFn?: typeof fetch
  /** Logger for debug/warn messages (optional) */
  logger?: {
    debug: (msg: string) => void
    warn: (msg: string) => void
  }
}

/**
 * Submit URLs to IndexNow API with fallback on rate limit
 * Works in both build-time (native fetch) and runtime ($fetch) contexts
 */
export async function submitToIndexNowShared(
  routes: string[],
  key: string,
  siteUrl: string,
  options?: SubmitOptions,
): Promise<IndexNowSubmitResult> {
  if (!siteUrl) {
    return { success: false, error: 'Site URL not configured' }
  }

  const fetchFn = options?.fetchFn ?? globalThis.fetch
  const log = options?.logger

  const body = buildIndexNowBody(routes, key, siteUrl)
  const endpoints = getIndexNowEndpoints()
  let lastError: string | undefined

  // Try each endpoint, fallback on 429
  for (const endpoint of endpoints) {
    log?.debug(`[indexnow] Submitting ${body.urlList.length} URLs to ${endpoint}`)

    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.ok ? { ok: true as const } : { error: `HTTP ${r.status}` })
      .catch((err: Error) => ({ error: err.message }))

    if ('error' in response) {
      lastError = response.error

      // On 429, try next endpoint
      if (lastError?.includes('429')) {
        log?.warn(`[indexnow] Rate limited on ${endpoint}, trying fallback...`)
        continue
      }

      // Other errors, don't fallback
      log?.warn(`[indexnow] Submission failed on ${endpoint}: ${lastError}`)
      return { success: false, error: lastError, host: endpoint }
    }

    log?.debug(`[indexnow] Successfully submitted ${body.urlList.length} URLs via ${endpoint}`)
    return { success: true, host: endpoint }
  }

  // All endpoints failed or rate limited
  return {
    success: false,
    error: lastError || 'All endpoints rate limited',
    host: endpoints[endpoints.length - 1],
  }
}

export interface PageHashMeta {
  route: string
  hash: string
}

export interface BuildMetaChanges {
  changed: number
  added: number
  removed: number
  changedRoutes?: string[]
  addedRoutes?: string[]
  removedRoutes?: string[]
}

export interface BuildMeta {
  buildId: string
  pageCount: number
  createdAt: string
  /** Changes from previous build (only present if prevMeta was available) */
  changes?: BuildMetaChanges
  pages: PageHashMeta[]
}

/**
 * Compare page hashes between current and previous builds
 * Returns changed, added, and removed routes
 */
export function comparePageHashes(
  currentPages: PageHashMeta[],
  prevMeta: BuildMeta | null | undefined,
): { changed: string[], added: string[], removed: string[] } {
  if (!prevMeta?.pages) {
    return { changed: [], added: [], removed: [] }
  }

  const prevHashes = new Map(prevMeta.pages.map(p => [p.route, p.hash]))
  const currentRoutes = new Set(currentPages.map(p => p.route))

  const changed: string[] = []
  const added: string[] = []

  for (const page of currentPages) {
    const prevHash = prevHashes.get(page.route)
    if (!prevHash) {
      added.push(page.route)
    }
    else if (prevHash !== page.hash) {
      changed.push(page.route)
    }
  }

  // Find removed pages
  const removed: string[] = []
  for (const route of prevHashes.keys()) {
    if (!currentRoutes.has(route)) {
      removed.push(route)
    }
  }

  return { changed, added, removed }
}
