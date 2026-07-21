import { describe, expect, it } from 'vitest'
import { parseSitemap as parseBufferedSitemap } from '../../src/runtime/server/compat/sitemap-parser-buffered'
import { parseSitemap as parseStreamingSitemap } from '../../src/runtime/server/compat/sitemap-parser-stream'
import { supportsSitemapStreamingParser } from '../../src/utils/sitemap-version'

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/about</loc><lastmod>2026-07-21</lastmod></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`

const INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/en.xml</loc></sitemap>
  <sitemap><loc>https://example.com/fr.xml</loc></sitemap>
</sitemapindex>`

function toChunkedStream(xml: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(xml)
  let offset = 0

  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

async function collectEvents(
  parse: typeof parseBufferedSitemap,
  xml: string,
) {
  const events = []
  for await (const event of parse(toChunkedStream(xml)))
    events.push(event)
  return events
}

describe.each([
  ['buffered compatibility adapter', parseBufferedSitemap],
  ['streaming adapter', parseStreamingSitemap],
])('%s', (_name, parse) => {
  it('parses a chunked URL set into the shared event contract', async () => {
    const events = await collectEvents(parse, URLSET)

    expect(events).toEqual([
      { _tag: 'kind', kind: 'urlset' },
      { _tag: 'url', url: { loc: 'https://example.com/about', lastmod: '2026-07-21' } },
      { _tag: 'url', url: { loc: 'https://example.com/contact' } },
    ])
  })

  it('parses a chunked sitemap index into the shared event contract', async () => {
    const events = await collectEvents(parse, INDEX)

    expect(events).toEqual([
      { _tag: 'kind', kind: 'index' },
      { _tag: 'sitemap', sitemap: { loc: 'https://example.com/en.xml' } },
      { _tag: 'sitemap', sitemap: { loc: 'https://example.com/fr.xml' } },
    ])
  })
})

describe('supportsSitemapStreamingParser', () => {
  it.each([
    ['7.6.0', false],
    ['8.2.9', false],
    ['8.3.0', true],
    ['8.3.0-beta.1', true],
    ['9.0.0', true],
    [undefined, false],
    ['invalid', false],
  ])('maps %s to %s', (version, expected) => {
    expect(supportsSitemapStreamingParser(version)).toBe(expected)
  })
})
