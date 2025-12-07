import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { getDevPages, jsonResult } from '../utils'

export default {
  name: 'list_pages',
  description: 'Lists all available pages with their routes. In dev mode, returns JSON from sitemap/routes (TOON format unavailable until build).',
  inputSchema: {},
  async handler() {
    const pages = await getDevPages()
    return jsonResult(pages)
  },
} satisfies McpToolDefinition
