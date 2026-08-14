import type {
  SitemapDocumentLoader,
  SitemapDocumentLoadResult,
  SitemapLoadRequest,
  SitemapUrlRecord,
  SitemapWalkEntry,
  SitemapWalkFailure,
  SitemapWalkPartialReason,
} from 'sitemapd'
import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import type { SitemapCrawlState } from './sitemap-crawl-state'
import { createSitemapReader } from 'sitemapd'
import { parseSitemap } from 'sitemapd/parse'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../logger'
import { getCfEnv, hasAssets } from './cloudflare'
import { createUniversalContext } from './context'
import { fetchRawWithEvent } from './fetch'

export interface SitemapUrl {
  loc: string
  lastmod?: string
}

export interface SitemapConfig {
  name: string
  route: string
}

const FETCH_TIMEOUT = 15_000
const SITEMAP_FALLBACK_ORIGIN = 'http://localhost'
const SITEMAP_READER_LIMITS = {
  maxRedirects: 5,
  maxDocuments: 100,
  maxDepth: 3,
  maxUrls: 50_000,
  maxEntries: 50_000,
  maxWireBytes: 50 * 1024 * 1024,
  maxDecodedBytes: 50 * 1024 * 1024,
} as const
const MAX_SITEMAP_CRAWL_ROUNDS = 10

interface SitemapCrawlResultBase {
  urls: SitemapUrl[]
  documentsAttempted: number
  urlsObserved: number
  startedAt: number
}

export type SitemapCrawlResult
  = | SitemapCrawlResultBase & { _tag: 'complete' }
    | SitemapCrawlResultBase & { _tag: 'partial', state: SitemapCrawlState, error: string }
    | SitemapCrawlResultBase & { _tag: 'failed', error: string }

/**
 * Get list of sitemaps from @nuxtjs/sitemap runtime config
 * Returns empty array if sitemap module not configured
 */
export function getSitemapsFromConfig(event?: H3Event): SitemapConfig[] {
  const runtimeConfig = useRuntimeConfig(event)
  const sitemapConfig = runtimeConfig.sitemap as {
    sitemaps?: Record<string, { sitemapName?: string, _route?: string }>
    isMultiSitemap?: boolean
  } | undefined

  if (!sitemapConfig?.sitemaps)
    return []

  const sitemaps: SitemapConfig[] = []

  for (const [key, sitemap] of Object.entries(sitemapConfig.sitemaps)) {
    // Skip 'index' entry (sitemap index, not actual sitemap)
    if (key === 'index')
      continue
    // Only include sitemaps with routes
    if (sitemap._route) {
      sitemaps.push({
        name: sitemap.sitemapName || key,
        route: sitemap._route,
      })
    }
  }

  return sitemaps
}

/**
 * Check if site has multiple sitemaps configured
 */
export function hasMultipleSitemaps(event: H3Event): boolean {
  const sitemaps = getSitemapsFromConfig(event)
  return sitemaps.length > 1
}

/**
 * Normalize sitemap URL entries to SitemapUrl[]
 */
function normalizeUrl(entry: SitemapUrlRecord): SitemapUrl {
  return {
    loc: entry.loc,
    lastmod: entry.lastmod,
  }
}

type ParsedUrl
  = | { _tag: 'ok', value: URL }
    | { _tag: 'error', input: string }

type BoundedBodyResult
  = | { _tag: 'ok', body: Uint8Array }
    | { _tag: 'limit', bytesRead: number }

type LocalFetchResult
  = | { _tag: 'ok', response: Response & { _data?: ReadableStream<Uint8Array> } }
    | { _tag: 'error', error: unknown, timedOut: boolean, cancelled: boolean }

type RecoveredUrlset
  = | { _tag: 'none' }
    | { _tag: 'failed', entries: SitemapUrlRecord[], reason: string }

function parseAbsoluteUrl(input: string, base?: string): ParsedUrl {
  try {
    return { _tag: 'ok', value: new URL(input, base) }
  }
  catch {
    return { _tag: 'error', input }
  }
}

function responseBody(
  response: Response & { _data?: ReadableStream<Uint8Array> },
): ReadableStream<Uint8Array> | null {
  const data = response._data
  if (data && typeof data.getReader === 'function')
    return data
  return response.body
}

async function cancelBody(
  body: ReadableStream<Uint8Array> | null,
  reason: string,
): Promise<void> {
  if (!body)
    return
  await body.cancel(reason).catch((error) => {
    // Cleanup failure cannot change the established HTTP result.
    logger.debug(`[sitemap] Failed to cancel response body: ${String(error)}`)
  })
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxWireBytes: number,
): Promise<BoundedBodyResult> {
  if (!body)
    return { _tag: 'ok', body: new Uint8Array() }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let bytesRead = 0
  let reachedEnd = false
  let exceeded = false

  try {
    while (!reachedEnd) {
      const next = await reader.read()
      reachedEnd = next.done
      if (!next.value)
        continue
      bytesRead += next.value.byteLength
      if (bytesRead > maxWireBytes) {
        exceeded = true
        break
      }
      chunks.push(next.value)
    }
  }
  finally {
    if (!reachedEnd) {
      await reader.cancel('sitemap wire limit reached').catch((error) => {
        // Cleanup failure cannot change the established wire-limit result.
        logger.debug(`[sitemap] Failed to cancel bounded response body: ${String(error)}`)
      })
    }
    reader.releaseLock()
  }

  if (exceeded)
    return { _tag: 'limit', bytesRead }

  const output = new Uint8Array(bytesRead)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { _tag: 'ok', body: output }
}

async function fetchLocalRoute(
  event: H3Event | undefined,
  route: string,
  usePublicAsset: boolean,
  request: SitemapLoadRequest,
): Promise<LocalFetchResult> {
  const controller = new AbortController()
  let timedOut = false
  const abortFromRequest = () => controller.abort(request.signal?.reason)
  if (request.signal?.aborted)
    abortFromRequest()
  else
    request.signal?.addEventListener('abort', abortFromRequest, { once: true })

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Sitemap fetch timed out', 'TimeoutError'))
  }, FETCH_TIMEOUT)

  const fetchPromise: Promise<Response & { _data?: ReadableStream<Uint8Array> }> = usePublicAsset
    ? getCfEnv(event)!.ASSETS!.fetch(
        new Request(new URL(route, 'https://assets.local'), {
          redirect: 'manual',
          signal: controller.signal,
        }),
      )
    : event
      ? fetchRawWithEvent(event, route, {
          redirect: 'manual',
          signal: controller.signal,
        })
      : globalThis.$fetch.raw(route, {
          responseType: 'stream',
          redirect: 'manual',
          retry: false,
          ignoreResponseError: true,
          signal: controller.signal,
        })

  return fetchPromise
    .then((response): LocalFetchResult => ({
      _tag: 'ok',
      response,
    }))
    .catch((error): LocalFetchResult => ({
      _tag: 'error',
      error,
      timedOut,
      cancelled: Boolean(request.signal?.aborted),
    }))
    .finally(() => {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', abortFromRequest)
    })
}

function createLocalSitemapLoader(
  event: H3Event | undefined,
  usePublicAsset: boolean,
  loadedBodies: Map<string, Uint8Array>,
): SitemapDocumentLoader {
  return async (request): Promise<SitemapDocumentLoadResult> => {
    const parsed = parseAbsoluteUrl(request.url)
    if (parsed._tag === 'error') {
      return {
        _tag: 'load_error',
        url: request.url,
        code: 'network',
        detail: `Invalid sitemap URL: ${request.url}`,
      }
    }

    const route = `${parsed.value.pathname}${parsed.value.search}`
    logger.debug(`[sitemap] Fetching ${route} via ${usePublicAsset ? 'ASSETS.fetch' : event ? 'event.fetch' : 'globalThis.$fetch'}`)
    const fetched = await fetchLocalRoute(event, route, usePublicAsset, request)
    if (fetched._tag === 'error') {
      return {
        _tag: 'load_error',
        url: request.url,
        code: fetched.timedOut ? 'timeout' : fetched.cancelled ? 'cancelled' : 'network',
        detail: fetched.error instanceof Error ? fetched.error.message : String(fetched.error),
      }
    }

    const { response } = fetched
    const body = responseBody(response)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await cancelBody(body, 'redirect response handled by sitemap reader')
      if (!location) {
        return {
          _tag: 'http_error',
          url: request.url,
          status: response.status,
          statusText: 'Redirect response is missing Location',
        }
      }
      return {
        _tag: 'redirect',
        url: request.url,
        location,
        status: response.status,
      }
    }
    if (response.status === 404 || response.status === 410) {
      await cancelBody(body, 'not found response body is unused')
      return { _tag: 'not_found', url: request.url, status: response.status }
    }
    if (!response.ok) {
      await cancelBody(body, 'error response body is unused')
      return {
        _tag: 'http_error',
        url: request.url,
        status: response.status,
        statusText: response.statusText,
      }
    }

    const maxWireBytes = request.maxWireBytes ?? SITEMAP_READER_LIMITS.maxWireBytes
    const read = await readBoundedBody(body, maxWireBytes)
      .then(result => ({ _tag: 'ok' as const, result }))
      .catch(error => ({ _tag: 'error' as const, error }))
    if (read._tag === 'error') {
      return {
        _tag: 'load_error',
        url: request.url,
        code: 'network',
        detail: read.error instanceof Error ? read.error.message : String(read.error),
      }
    }
    if (read.result._tag === 'limit') {
      return {
        _tag: 'load_error',
        url: request.url,
        code: 'wire_limit',
        detail: `Sitemap response exceeds ${maxWireBytes} wire bytes`,
        bytesRead: read.result.bytesRead,
      }
    }
    loadedBodies.set(request.url, read.result.body)
    return {
      _tag: 'body',
      url: request.url,
      body: read.result.body,
    }
  }
}

async function recoverFailedUrlset(body: Uint8Array): Promise<RecoveredUrlset> {
  const entries: SitemapUrlRecord[] = []
  let kind: 'urlset' | 'index' | undefined
  let failureReason: string | undefined

  for await (const event of parseSitemap(body, {
    maxDecodedBytes: SITEMAP_READER_LIMITS.maxDecodedBytes,
    maxEntries: SITEMAP_READER_LIMITS.maxEntries,
  })) {
    if (event._tag === 'document')
      kind = event.kind
    else if (event._tag === 'url')
      entries.push(event.entry)
    else if (event._tag === 'end' && event.completeness._tag === 'failed')
      failureReason = event.completeness.reason
  }

  if (kind !== 'urlset' || !failureReason)
    return { _tag: 'none' }
  return { _tag: 'failed', entries, reason: failureReason }
}

function formatWalkFailure(failure: SitemapWalkFailure): string {
  if (failure.result._tag === 'not_found')
    return `${failure.url}: HTTP ${failure.result.status}`
  return `${failure.url}: ${failure.result.reason}: ${failure.result.detail}`
}

function toWalkEntry(failure: SitemapWalkFailure): SitemapWalkEntry {
  if (failure.source === 'root') {
    return {
      url: failure.url,
      depth: 0,
      source: 'root',
    }
  }
  return {
    url: failure.url,
    depth: failure.depth,
    source: 'index_child',
    parentUrl: failure.parentUrl,
  }
}

function isRetryableWalkFailure(failure: SitemapWalkFailure): boolean {
  if (failure.result._tag === 'not_found')
    return true
  if (failure.result.reason === 'http')
    return true
  return failure.result.reason === 'load'
    && (failure.result.code === 'network' || failure.result.code === 'timeout' || failure.result.code === 'cancelled')
}

function createNextFrontier(
  failures: SitemapWalkFailure[],
  frontier: SitemapWalkEntry[],
  seenDocuments: Set<string>,
): SitemapWalkEntry[] {
  const seenEntries = new Set<string>()
  const entries = [
    ...failures.filter(isRetryableWalkFailure).map(toWalkEntry),
    ...frontier,
  ]
  return entries.filter((entry) => {
    if (seenDocuments.has(entry.url) || seenEntries.has(entry.url))
      return false
    seenEntries.add(entry.url)
    return true
  })
}

function isTerminalPartialReason(reason: SitemapWalkPartialReason): boolean {
  return reason === 'depth_limit' || reason === 'url_limit' || reason === 'document_partial'
}

function formatWalkError(result: {
  reasons: SitemapWalkPartialReason[]
  failures: SitemapWalkFailure[]
}, parseFailures: string[]): string {
  if (result.failures.length === 1 && parseFailures.length === 1 && result.reasons.length === 1 && result.reasons[0] === 'read_failure')
    return `Sitemap parse failed: ${parseFailures[0]}`

  const failures = result.failures.map(formatWalkFailure)
  const details = failures.length > 0 ? `; ${failures.join('; ')}` : ''
  return `sitemap walk partial (${result.reasons.join(', ')}${details})`
}

/**
 * Execute one bounded sitemap traversal round. Partial results include the
 * exact pending frontier and committed document set needed by the next round.
 */
export async function crawlSitemapByRoute(
  event: H3Event | undefined,
  input: { route: string, state?: SitemapCrawlState | null },
): Promise<SitemapCrawlResult> {
  const { route, state = null } = input
  const previousDocumentsAttempted = state?.documentsAttempted ?? 0
  const previousUrlsObserved = state?.urlsObserved ?? 0
  const previousRounds = state?.rounds ?? 0
  const startedAt = state?.startedAt ?? Date.now()
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const usePublicAsset = config.sitemapPrerendered && hasAssets(event)
  const configuredSiteUrl = createUniversalContext(event).siteUrl ?? SITEMAP_FALLBACK_ORIGIN
  const siteUrl = parseAbsoluteUrl(configuredSiteUrl)
  if (siteUrl._tag === 'error') {
    return {
      _tag: 'failed',
      urls: [],
      documentsAttempted: previousDocumentsAttempted,
      urlsObserved: previousUrlsObserved,
      startedAt,
      error: `Invalid site URL: ${configuredSiteUrl}`,
    }
  }

  const rootUrl = parseAbsoluteUrl(route, `${siteUrl.value.origin}/`)
  if (rootUrl._tag === 'error') {
    return {
      _tag: 'failed',
      urls: [],
      documentsAttempted: previousDocumentsAttempted,
      urlsObserved: previousUrlsObserved,
      startedAt,
      error: `Invalid sitemap route: ${route}`,
    }
  }

  const remainingUrls = SITEMAP_READER_LIMITS.maxUrls - previousUrlsObserved
  if (remainingUrls <= 0) {
    return {
      _tag: 'failed',
      urls: [],
      documentsAttempted: previousDocumentsAttempted,
      urlsObserved: previousUrlsObserved,
      startedAt,
      error: `sitemap walk partial (url_limit)`,
    }
  }

  const loadedBodies = new Map<string, Uint8Array>()
  const seenDocuments = new Set(state?.seenDocuments ?? [])
  const reader = createSitemapReader({
    limits: SITEMAP_READER_LIMITS,
    loadDocument: createLocalSitemapLoader(event, usePublicAsset, loadedBodies),
    authorizeTarget: (request) => {
      const target = parseAbsoluteUrl(request.url)
      if (target._tag === 'error')
        return { _tag: 'deny', reason: `Invalid sitemap target: ${request.url}` }
      if (target.value.origin !== siteUrl.value.origin) {
        return {
          _tag: 'deny',
          reason: `Sitemap target origin ${target.value.origin} differs from ${siteUrl.value.origin}`,
        }
      }
      return { _tag: 'allow' }
    },
  })

  const result = await reader.walk(state?.frontier ?? rootUrl.value.toString(), {
    ...SITEMAP_READER_LIMITS,
    maxUrls: remainingUrls,
    seenDocuments: state?.seenDocuments,
    onDocument: (document) => {
      seenDocuments.add(document.requestedUrl)
    },
  })
  const documentsAttempted = previousDocumentsAttempted + result.documentsAttempted
  const urlsObserved = previousUrlsObserved + result.urlsObserved
  const entries = [...result.entries]
  const parseFailures: string[] = []
  for (const failure of result.failures) {
    if (failure.result._tag !== 'failure' || failure.result.reason !== 'document')
      continue
    const body = loadedBodies.get(failure.result.url)
    if (!body)
      continue
    const recovered = await recoverFailedUrlset(body)
    if (recovered._tag === 'none')
      continue
    entries.push(...recovered.entries)
    parseFailures.push(recovered.reason)
  }

  const seenUrls = new Set<string>()
  const urls = entries
    .filter((entry) => {
      if (seenUrls.has(entry.loc))
        return false
      seenUrls.add(entry.loc)
      return true
    })
    .slice(0, remainingUrls)
    .map(normalizeUrl)
  logger.debug(`[sitemap] Found ${urls.length} URLs from ${rootUrl.value.pathname}${rootUrl.value.search}`)

  if (result._tag === 'complete') {
    return {
      _tag: 'complete',
      urls,
      documentsAttempted,
      urlsObserved,
      startedAt,
    }
  }

  const error = formatWalkError(result, parseFailures)
  const frontier = createNextFrontier(result.failures, result.frontier, seenDocuments)
  const rounds = previousRounds + 1
  const canContinue = frontier.length > 0
    && rounds < MAX_SITEMAP_CRAWL_ROUNDS
    && !result.reasons.some(isTerminalPartialReason)

  logger.warn(`[sitemap] ${error}`)
  if (!canContinue) {
    return {
      _tag: 'failed',
      urls,
      documentsAttempted,
      urlsObserved,
      startedAt,
      error,
    }
  }

  return {
    _tag: 'partial',
    urls,
    documentsAttempted,
    urlsObserved,
    startedAt,
    error,
    state: {
      _tag: 'continuation',
      frontier,
      seenDocuments: [...seenDocuments],
      documentsAttempted,
      urlsObserved,
      rounds,
      startedAt,
    },
  }
}

/**
 * Fetch and parse a single sitemap by route
 * Supports both request context (event.fetch) and cron context (ASSETS.fetch or globalThis.$fetch)
 */
export async function fetchSitemapByRoute(
  event: H3Event | undefined,
  route: string,
): Promise<{ urls: SitemapUrl[], error?: string }> {
  const result = await crawlSitemapByRoute(event, { route })
  return result._tag === 'complete'
    ? { urls: result.urls }
    : { urls: result.urls, error: result.error }
}

/**
 * Fetch all URLs from all sitemaps (or single sitemap if not multi-sitemap)
 * Used for backwards compatibility and llms.txt generation
 */
export async function fetchSitemapUrls(event: H3Event): Promise<SitemapUrl[]> {
  const sitemaps = getSitemapsFromConfig(event)

  // Multi-sitemap: fetch from each configured sitemap
  if (sitemaps.length > 0) {
    logger.debug(`[sitemap] Multi-sitemap mode: ${sitemaps.length} sitemaps`)
    const allUrls: SitemapUrl[] = []

    for (const sitemap of sitemaps) {
      // Include whatever URLs we got even on a partial failure: for llms.txt a
      // partial page list beats none. The error is already logged downstream and
      // matters to the cron crawl-status path, not to URL aggregation here.
      const { urls } = await fetchSitemapByRoute(event, sitemap.route)
      allUrls.push(...urls)
    }

    return allUrls
  }

  // Single sitemap fallback: fetch /sitemap.xml
  logger.debug(`[sitemap] Single sitemap mode: /sitemap.xml`)
  const { urls, error } = await fetchSitemapByRoute(event, '/sitemap.xml')

  if (error) {
    logger.warn('Sitemap not found at /sitemap.xml - ensure @nuxtjs/sitemap is installed and configured')
  }
  else if (urls.length === 0) {
    logger.warn('Sitemap is empty - add routes to sitemap or configure sitemap.sources in nuxt.config')
  }

  return urls
}
