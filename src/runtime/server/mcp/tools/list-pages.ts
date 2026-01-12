import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import type { PageEntry } from '../../db/queries'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { countPages, queryPages } from '../../db/queries'

const inputSchema = {
  limit: z.number().optional().default(100).describe('Max pages to return (default: 100)'),
  offset: z.number().optional().default(0).describe('Skip first N pages (for pagination)'),
}

const tool: McpToolDefinition = {
  name: 'list_pages',
  description: 'Lists all available pages with titles, descriptions and routes. Supports pagination via limit/offset.',
  inputSchema,
  cache: '1h',
  async handler({ limit, offset }) {
    const event = useEvent()
    const pages = await queryPages(event, { limit: limit as number, offset: offset as number }) as PageEntry[]
    const total = await countPages(event)

    return {
      content: [{
        type: 'text',
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
          hasMore: (offset as number) + pages.length < total,
        }),
      }],
    }
  },
}

export default tool
