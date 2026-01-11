import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { useDatabase } from '../../db'
import { queryPages } from '../../db/queries'

const inputSchema = {
  route: z.string().describe('Page route (e.g., "/about", "/blog/my-post")'),
}

const tool: McpToolDefinition = {
  name: 'get_page',
  description: 'Get a single page by route, including full markdown content.',
  inputSchema,
  cache: '1h',
  async handler({ route }) {
    // Try to get event from context for D1 compatibility
    let event
    try { event = useEvent() }
    catch { /* no event context */ }
    const db = await useDatabase(event)
    const page = await queryPages(db, { route: route as string, includeMarkdown: true })
    if (!page) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Page not found' }) }] }
    }
    return { content: [{ type: 'text', text: JSON.stringify(page) }] }
  },
}

export default tool
