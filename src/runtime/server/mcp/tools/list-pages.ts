import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { getPagesList } from '../../utils/pageData'

/**
 * Lists all pages with metadata
 */
export default {
  name: 'list_pages',
  description: 'Lists all available pages with titles, descriptions and routes.',
  inputSchema: {},
  cache: '1h',
  async handler() {
    const pages = await getPagesList()
    return { content: [{ type: 'text', text: JSON.stringify(pages) }] }
  },
} satisfies McpToolDefinition
