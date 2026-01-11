import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { z } from 'zod'
import { getPagesList } from '../../utils/pageData'

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
    const pages = await getPagesList()
    const total = pages.length
    const paginated = pages.slice(offset as number, (offset as number) + (limit as number))
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          pages: paginated,
          total,
          limit,
          offset,
          hasMore: (offset as number) + paginated.length < total,
        }),
      }],
    }
  },
}

export default tool
