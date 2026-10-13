import { gzipSync } from 'node:zlib'
import { collectSitemap } from 'sitemapd/parse'
import { describe, expect, it } from 'vitest'
import { markIndexedSitemapLastmods, stripIndexedSitemapLastmods } from '../../src/runtime/server/utils/sitemap-lastmod'

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/source?a=1&amp;b=2</loc><lastmod>2026-08-01</lastmod></url>
  <url><loc>https://example.com/indexed</loc><lastmod>2026-08-02</lastmod></url>
</urlset>`

async function entries(input: string | Uint8Array) {
  const parsed = await collectSitemap(input)
  if (parsed._tag !== 'document' || parsed.document._tag !== 'urlset')
    throw new Error('Expected sitemap URLs')
  return parsed.document.entries
}

describe('sitemap source date provenance', () => {
  it('keeps public enrichment and excludes only indexed dates from source crawling', async () => {
    const publicXml = markIndexedSitemapLastmods(xml, new Set(['https://example.com/indexed']))
    expect(await entries(publicXml)).toEqual([
      { loc: 'https://example.com/source?a=1&b=2', lastmod: '2026-08-01' },
      { loc: 'https://example.com/indexed', lastmod: '2026-08-02' },
    ])
    const sourceXml = stripIndexedSitemapLastmods(new TextEncoder().encode(publicXml))
    expect(await entries(sourceXml)).toEqual([
      { loc: 'https://example.com/source?a=1&b=2', lastmod: '2026-08-01' },
      { loc: 'https://example.com/indexed' },
    ])
  })

  it('recognizes serialized escaped URLs and whitespace after the provenance marker', async () => {
    const publicXml = markIndexedSitemapLastmods(xml, new Set(['https://example.com/source?a=1&b=2']))
      .replace('--><lastmod>', '-->\n  <lastmod>')
    expect(await entries(stripIndexedSitemapLastmods(new TextEncoder().encode(publicXml)))).toEqual([
      { loc: 'https://example.com/source?a=1&b=2' },
      { loc: 'https://example.com/indexed', lastmod: '2026-08-02' },
    ])
  })

  it('preserves external source dates without module provenance', async () => {
    expect(await entries(stripIndexedSitemapLastmods(new TextEncoder().encode(xml)))).toEqual([
      { loc: 'https://example.com/source?a=1&b=2', lastmod: '2026-08-01' },
      { loc: 'https://example.com/indexed', lastmod: '2026-08-02' },
    ])
  })

  it('preserves compressed external sitemap dates for the bounded parser', async () => {
    expect(await entries(stripIndexedSitemapLastmods(gzipSync(xml)))).toEqual([
      { loc: 'https://example.com/source?a=1&b=2', lastmod: '2026-08-01' },
      { loc: 'https://example.com/indexed', lastmod: '2026-08-02' },
    ])
  })

  it('keeps invalid UTF-8 visible to the parser', async () => {
    const valid = new TextEncoder().encode(markIndexedSitemapLastmods(xml, new Set(['https://example.com/indexed'])))
    const invalid = Uint8Array.from([...valid, 0xFF])
    const parsed = await collectSitemap(stripIndexedSitemapLastmods(invalid))
    expect(parsed.completeness).toEqual({ _tag: 'failed', reason: 'invalid_utf8' })
  })
})
