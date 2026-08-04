import type { ApiCatalogEntry } from '../../src/runtime/types'
import { describe, expect, it } from 'vitest'
import { API_CATALOG_PATH, API_CATALOG_PROFILE, resolveApiCatalogConfig } from '../../src/utils/api-catalog'

describe('resolveApiCatalogConfig', () => {
  it('keeps the catalog disabled without user or generated entries', () => {
    expect(resolveApiCatalogConfig(undefined, {
      siteBaseURL: 'https://example.com/docs/',
    })).toEqual({ _tag: 'Disabled' })
  })

  it('resolves entry and relation URLs against the deployed site base', () => {
    const result = resolveApiCatalogConfig({
      entries: [
        {
          anchor: '/api',
          serviceDesc: { href: '/openapi.json', type: 'application/vnd.oai.openapi+json' },
          serviceDoc: [{ href: '/docs/api', type: 'text/html', title: 'API documentation' }],
          status: { href: 'status', type: 'application/json' },
        },
      ],
    }, {
      siteBaseURL: 'https://example.com/docs/',
    })

    expect(result).toEqual({
      _tag: 'Enabled',
      config: {
        href: `https://example.com/docs${API_CATALOG_PATH}`,
        document: {
          linkset: [
            {
              'anchor': 'https://example.com/docs/api',
              'service-desc': [
                { href: 'https://example.com/docs/openapi.json', type: 'application/vnd.oai.openapi+json' },
              ],
              'service-doc': [
                { href: 'https://example.com/docs/docs/api', type: 'text/html', title: 'API documentation' },
              ],
              'status': [
                { href: 'https://example.com/docs/status', type: 'application/json' },
              ],
            },
          ],
        },
        mediaType: `application/linkset+json; profile="${API_CATALOG_PROFILE}"`,
      },
    })
  })

  it('preserves absolute URLs and optional target attributes', () => {
    const result = resolveApiCatalogConfig({
      entries: [{
        anchor: 'https://api.example.net/v1',
        item: {
          href: 'https://api.example.net/v1/openapi.json',
          hreflang: 'en',
          media: 'screen',
        },
      }],
    }, { siteBaseURL: 'https://example.com/' })

    expect(result).toMatchObject({
      _tag: 'Enabled',
      config: {
        document: {
          linkset: [{
            anchor: 'https://api.example.net/v1',
            item: [{
              href: 'https://api.example.net/v1/openapi.json',
              hreflang: ['en'],
              media: 'screen',
            }],
          }],
        },
      },
    })
  })

  it('merges generated entries before resolving once', () => {
    const generatedEntries: ApiCatalogEntry[] = [{
      anchor: '/mcp',
      item: { href: '/mcp', type: 'application/json' },
      serviceDesc: { href: '/.well-known/mcp/server-card.json', type: 'application/json' },
    }]

    const result = resolveApiCatalogConfig(undefined, {
      siteBaseURL: 'https://example.com/',
      generatedEntries,
    })

    expect(result).toMatchObject({
      _tag: 'Enabled',
      config: {
        document: {
          linkset: [{
            'anchor': 'https://example.com/mcp',
            'item': [{ href: 'https://example.com/mcp', type: 'application/json' }],
            'service-desc': [{
              href: 'https://example.com/.well-known/mcp/server-card.json',
              type: 'application/json',
            }],
          }],
        },
      },
    })
  })

  it('honors an explicit false over generated entries', () => {
    expect(resolveApiCatalogConfig(false, {
      siteBaseURL: 'https://example.com/',
      generatedEntries: [{ anchor: '/mcp', item: { href: '/mcp' } }],
    })).toEqual({ _tag: 'Disabled' })
  })

  it('returns tagged errors for malformed entries', () => {
    expect(resolveApiCatalogConfig({ entries: [] }, {
      siteBaseURL: 'https://example.com/',
    })).toEqual({
      _tag: 'Invalid',
      errors: [{ _tag: 'MissingEntries' }],
    })

    expect(resolveApiCatalogConfig({
      entries: [{ anchor: '', serviceDesc: { href: '' } }],
    }, {
      siteBaseURL: 'https://example.com/',
    })).toEqual({
      _tag: 'Invalid',
      errors: [
        { _tag: 'InvalidAnchor', entryIndex: 0 },
        { _tag: 'InvalidLinkHref', entryIndex: 0, relation: 'serviceDesc', targetIndex: 0 },
      ],
    })
  })

  it('reports a missing site URL only for relative values', () => {
    expect(resolveApiCatalogConfig({
      entries: [{ anchor: '/api', item: { href: '/api' } }],
    }, {})).toEqual({
      _tag: 'Invalid',
      errors: [
        { _tag: 'MissingSiteUrl', entryIndex: 0, field: 'anchor' },
        { _tag: 'MissingSiteUrl', entryIndex: 0, field: 'item[0].href' },
      ],
    })
  })

  it('returns a tagged error for malformed URLs', () => {
    expect(resolveApiCatalogConfig({
      entries: [{ anchor: 'https://[', item: { href: 'https://%' } }],
    }, { siteBaseURL: 'https://example.com/' })).toEqual({
      _tag: 'Invalid',
      errors: [
        { _tag: 'InvalidUrl', entryIndex: 0, field: 'anchor', value: 'https://[' },
        { _tag: 'InvalidUrl', entryIndex: 0, field: 'item[0].href', value: 'https://%' },
      ],
    })
  })
})
