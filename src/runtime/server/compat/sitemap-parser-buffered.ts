import type { ParseSitemap, SitemapXmlInput } from './sitemap-parser'
import { isSitemapIndex, parseSitemapIndex, parseSitemapXml } from '@nuxtjs/sitemap/utils'

async function readSitemapXml(input: SitemapXmlInput): Promise<string> {
  if (typeof input === 'string')
    return input
  if (input instanceof Uint8Array)
    return new TextDecoder().decode(input)
  return new Response(input).text()
}

export const parseSitemap: ParseSitemap = async function* (input) {
  const xml = await readSitemapXml(input)

  if (isSitemapIndex(xml)) {
    const result = await parseSitemapIndex(xml)
    yield { _tag: 'kind', kind: 'index' }
    for (const warning of result.warnings)
      yield { _tag: 'warning', warning }
    for (const sitemap of result.entries)
      yield { _tag: 'sitemap', sitemap }
    return
  }

  const result = await parseSitemapXml(xml)
  yield { _tag: 'kind', kind: 'urlset' }
  for (const warning of result.warnings)
    yield { _tag: 'warning', warning }
  for (const url of result.urls)
    yield { _tag: 'url', url }
}
