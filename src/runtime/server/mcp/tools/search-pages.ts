import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { z } from 'zod'
import { useDatabase } from '../../db'
import { searchPages } from '../../db/queries'

const inputSchema = {
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(10).describe('Max results'),
}

const tool: McpToolDefinition = {
  name: 'search_pages',
  description: 'Search pages by title, description, route, headings, keywords, and content using full-text search.',
  inputSchema,
  cache: '5m',
  async handler({ query, limit }) {
    const db = await useDatabase()
    const results = await searchPages(db, query as string, { limit: limit as number })
    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  },
}

export default tool
