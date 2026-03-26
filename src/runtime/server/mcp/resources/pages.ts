import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'
import type { PageEntry } from '../../db/queries'
import { useEvent } from 'nitropack/runtime'
import { countPages, queryPages } from '../../db/queries'

export default ({
  uri: 'resource://nuxt-ai-ready/pages',
  name: 'All Pages',
  description: 'Page listing as JSON. Supports ?limit=N&offset=N query parameters for pagination.',
  metadata: {
    mimeType: 'application/json',
  },
  cache: '1h',
  async handler(uri: URL) {
    const event = useEvent()
    const limit = Math.min(Math.max(Number(uri.searchParams.get('limit')) || 100, 1), 500)
    const offset = Math.max(Number(uri.searchParams.get('offset')) || 0, 0)
    const pages = await queryPages(event, { limit, offset }) as PageEntry[]
    const total = await countPages(event)
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify({
          pages: pages.map(p => ({
            route: p.route,
            title: p.title || p.route,
            description: p.description || '',
            headings: p.headings || undefined,
            keywords: p.keywords?.length ? p.keywords : undefined,
          })),
          total,
          limit,
          offset,
          hasMore: offset + pages.length < total,
        }),
      }],
    }
  },
} satisfies McpResourceDefinition)
