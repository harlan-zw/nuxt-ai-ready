import { describe, expect, it } from 'vitest'
import {
  AI_CATALOG_MEDIA_TYPE,
  AI_CATALOG_PATH,
  createAiCatalogEtag,
  matchesAiCatalogEtag,
  resolveAiCatalog,
} from '../../src/utils/ai-catalog'

describe('ai catalog', () => {
  it('publishes MCP Server Card discovery at the origin well-known path', () => {
    expect(AI_CATALOG_PATH).toBe('/.well-known/ai-catalog.json')
    expect(AI_CATALOG_MEDIA_TYPE).toBe('application/ai-catalog+json')
    expect(resolveAiCatalog({
      siteUrl: 'https://skilld.dev/docs/',
      serverCardName: 'dev.skilld/registry',
      serverCardUrl: 'https://skilld.dev/docs/agent/mcp/server-card',
    })).toEqual({
      specVersion: '1.0',
      entries: [{
        identifier: 'urn:air:skilld.dev:mcp:registry',
        type: 'application/mcp-server-card+json',
        url: 'https://skilld.dev/docs/agent/mcp/server-card',
      }],
    })
  })

  it('creates stable strong ETags and matches conditional requests', () => {
    const catalog = resolveAiCatalog({
      siteUrl: 'https://example.com',
      serverCardName: 'com.example/search',
      serverCardUrl: 'https://example.com/mcp/server-card',
    })
    const etag = createAiCatalogEtag(catalog)

    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    expect(createAiCatalogEtag(catalog)).toBe(etag)
    expect(matchesAiCatalogEtag(`"stale", W/${etag}`, etag)).toBe(true)
    expect(matchesAiCatalogEtag(undefined, etag)).toBe(false)
  })
})
