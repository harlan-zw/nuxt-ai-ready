import type { SitemapSourceInput } from '@nuxtjs/sitemap'
import { describe, expect, it } from 'vitest'
import {
  collectSitemapFallbackSources,
  mergeSitemapFallbackSources,
} from '../../src/runtime/sitemap-source-fallback'

describe('sitemap source fallback', () => {
  it('captures declarative URLs and sources without evaluating functions', () => {
    const urls = () => ['/function-url']
    expect(collectSitemapFallbackSources({
      urls,
      sources: [
        { urls: ['/source-url'] },
        '/api/sitemap-urls',
      ],
    })).toEqual({
      sources: [
        { urls: ['/source-url'] },
        '/api/sitemap-urls',
      ],
      warnings: [],
    })
  })

  it('reports sources that cannot be serialized', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    const result = collectSitemapFallbackSources({ sources: [circular] })

    expect(result.sources).toEqual([])
    expect(result.warnings).toEqual([
      expect.stringContaining('Could not preserve sitemap.sources[0]'),
    ])
  })

  it('restores missing inline and fetched sources', () => {
    const existing: SitemapSourceInput[] = [{
      context: { name: 'nuxt:pages' },
      urls: ['/'],
    }]
    const fallback: SitemapSourceInput[] = [
      {
        context: { name: 'configured' },
        urls: ['/', '/docs/api'],
      },
      '/api/sitemap-urls',
    ]

    expect(mergeSitemapFallbackSources(existing, fallback)).toEqual([
      existing[0],
      {
        context: { name: 'configured' },
        urls: ['/docs/api'],
      },
      '/api/sitemap-urls',
    ])
  })

  it('does not duplicate sources already supplied by Sitemap', () => {
    const existing: SitemapSourceInput[] = [
      {
        context: { name: 'configured' },
        urls: ['/docs/api'],
      },
      ['/api/sitemap-urls', { headers: { authorization: 'test' } }],
    ]

    expect(mergeSitemapFallbackSources(existing, existing)).toEqual(existing)
  })
})
