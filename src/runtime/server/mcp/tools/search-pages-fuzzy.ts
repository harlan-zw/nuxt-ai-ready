import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import Fuse from 'fuse.js'
import { z } from 'zod'
import { getPagesList } from '../../utils/pageData'

const inputSchema = {
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(10).describe('Max results'),
}

const tool: McpToolDefinition = {
  name: 'search_pages_fuzzy',
  description: 'Fuzzy search pages by title, description, route, headings, and keywords.',
  inputSchema,
  cache: '5m',
  async handler({ query, limit }) {
    const pages = await getPagesList()
    const fuse = new Fuse(pages, {
      keys: ['title', 'description', 'route', 'headings', 'keywords'],
      threshold: 0.4,
      includeScore: true,
    })
    const results = fuse.search(query as string, { limit: limit as number })
    const items = results.map(r => ({ ...r.item, score: r.score ?? 0 }))
    return { content: [{ type: 'text', text: JSON.stringify(items) }] }
  },
}

export default tool
