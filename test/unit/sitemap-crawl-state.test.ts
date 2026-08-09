import type { SitemapCrawlState } from '../../src/runtime/server/utils/sitemap-crawl-state'
import { describe, expect, it } from 'vitest'
import { parseSitemapCrawlState, serializeSitemapCrawlState } from '../../src/runtime/server/utils/sitemap-crawl-state'

const state: SitemapCrawlState = {
  _tag: 'continuation',
  frontier: [{
    url: 'https://example.com/child.xml',
    depth: 1,
    source: 'index_child',
    parentUrl: 'https://example.com/sitemap.xml',
  }],
  seenDocuments: ['https://example.com/sitemap.xml'],
  documentsAttempted: 100,
  urlsObserved: 20,
  rounds: 1,
  startedAt: 1_700_000_000_000,
}

describe('sitemap crawl state', () => {
  it('round trips valid continuation state', () => {
    expect(parseSitemapCrawlState(serializeSitemapCrawlState(state))).toEqual({
      _tag: 'ok',
      state,
    })
  })

  it('maps empty storage to a fresh crawl', () => {
    expect(parseSitemapCrawlState(null)).toEqual({ _tag: 'ok', state: null })
  })

  it('rejects malformed frontier metadata at the storage boundary', () => {
    const malformed = JSON.stringify({
      ...state,
      frontier: [{
        url: 'https://example.com/child.xml',
        depth: 1,
        source: 'index_child',
      }],
    })

    const parsed = parseSitemapCrawlState(malformed)

    expect(parsed._tag).toBe('error')
  })
})
