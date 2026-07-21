export type SitemapXmlInput = string | Uint8Array | ReadableStream<Uint8Array>

export interface ParsedSitemapUrl {
  loc: string
  lastmod?: string | Date
}

export interface ParsedSitemapIndexEntry {
  loc: string
  lastmod?: string
}

export interface SitemapParserWarning {
  message: string
}

export type SitemapStreamEvent
  = { _tag: 'kind', kind: 'urlset' | 'index' }
    | { _tag: 'url', url: string | ParsedSitemapUrl }
    | { _tag: 'sitemap', sitemap: ParsedSitemapIndexEntry }
    | { _tag: 'warning', warning: SitemapParserWarning }

export type ParseSitemap = (input: SitemapXmlInput) => AsyncGenerator<SitemapStreamEvent>
