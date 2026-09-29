import { describe, expect, it } from 'vitest'
import { mapSitemapRoutes } from '../../src/runtime/server/utils/sitemap-routes'

describe('mapSitemapRoutes', () => {
  it('keeps page routes that contain a dot and drops files', () => {
    const routes = mapSitemapRoutes([
      { loc: 'https://example.com/v1.2' },
      { loc: 'https://example.com/docs/v1.2/intro' },
      { loc: 'https://example.com/feed.xml' },
      { loc: '/about' },
    ])

    expect([...routes.keys()]).toEqual(['/v1.2', '/docs/v1.2/intro', '/about'])
  })
})
