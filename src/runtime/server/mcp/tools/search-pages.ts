import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { useEvent } from 'nitropack/runtime'
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
    // Try to get event from context for D1 compatibility
    let event
    try { event = useEvent() }
    catch { /* no event context */ }
    const db = await useDatabase(event)
    const results = await searchPages(db, query as string, { limit: limit as number })
    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  },
}

export default tool
