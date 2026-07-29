import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import type { PageEntry } from '../../db/queries'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { SITE_TOOL_CATALOG } from '../../../site-tool-catalog'
import { countPages, queryPages } from '../../db/queries'

const inputSchema = {
  limit: z.number().int().min(1).max(50).optional().default(20).describe(SITE_TOOL_CATALOG.list_pages.parameters.limit),
  offset: z.number().int().min(0).optional().default(0).describe(SITE_TOOL_CATALOG.list_pages.parameters.offset),
}

const tool: McpToolDefinition<typeof inputSchema> = {
  name: SITE_TOOL_CATALOG.list_pages.name,
  title: SITE_TOOL_CATALOG.list_pages.title,
  description: SITE_TOOL_CATALOG.list_pages.description,
  inputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  cache: '1h',
  async handler({ limit, offset }) {
    const event = useEvent()
    const pages = await queryPages(event, { limit, offset }) as PageEntry[]
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
          hasMore: offset + pages.length < total,
        }),
      }],
    }
  },
}

export default tool
