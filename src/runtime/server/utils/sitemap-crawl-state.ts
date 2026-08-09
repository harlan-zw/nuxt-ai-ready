import type { SitemapWalkEntry } from 'sitemapd'

export interface SitemapCrawlState {
  _tag: 'continuation'
  frontier: SitemapWalkEntry[]
  seenDocuments: string[]
  documentsAttempted: number
  urlsObserved: number
  rounds: number
  startedAt: number
}

export type SitemapCrawlStateParseResult
  = | { _tag: 'ok', state: SitemapCrawlState | null }
    | { _tag: 'error', error: string }

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isWalkEntry(value: unknown): value is SitemapWalkEntry {
  if (!value || typeof value !== 'object')
    return false

  const entry = value as Record<string, unknown>
  if (typeof entry.url !== 'string' || entry.url.length === 0 || !isNonNegativeInteger(entry.depth))
    return false
  if (entry.source === 'root')
    return entry.depth === 0 && entry.parentUrl === undefined
  return entry.source === 'index_child'
    && entry.depth > 0
    && typeof entry.parentUrl === 'string'
    && entry.parentUrl.length > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0)
}

function parseState(value: unknown): SitemapCrawlStateParseResult {
  if (!value || typeof value !== 'object')
    return { _tag: 'error', error: 'Sitemap crawl state must be an object' }

  const state = value as Record<string, unknown>
  if (state._tag !== 'continuation')
    return { _tag: 'error', error: 'Sitemap crawl state has an invalid tag' }
  if (!Array.isArray(state.frontier) || state.frontier.length === 0 || !state.frontier.every(isWalkEntry))
    return { _tag: 'error', error: 'Sitemap crawl state has an invalid frontier' }
  if (!isStringArray(state.seenDocuments))
    return { _tag: 'error', error: 'Sitemap crawl state has invalid seen documents' }
  if (!isNonNegativeInteger(state.documentsAttempted))
    return { _tag: 'error', error: 'Sitemap crawl state has an invalid document count' }
  if (!isNonNegativeInteger(state.urlsObserved))
    return { _tag: 'error', error: 'Sitemap crawl state has an invalid URL count' }
  if (!isNonNegativeInteger(state.rounds) || state.rounds === 0)
    return { _tag: 'error', error: 'Sitemap crawl state has an invalid round count' }
  if (!isNonNegativeInteger(state.startedAt))
    return { _tag: 'error', error: 'Sitemap crawl state has an invalid start timestamp' }

  return { _tag: 'ok', state: state as unknown as SitemapCrawlState }
}

export function parseSitemapCrawlState(value: string | null): SitemapCrawlStateParseResult {
  if (value === null)
    return { _tag: 'ok', state: null }

  try {
    return parseState(JSON.parse(value))
  }
  catch (error) {
    return {
      _tag: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function serializeSitemapCrawlState(state: SitemapCrawlState): string {
  return JSON.stringify(state)
}
