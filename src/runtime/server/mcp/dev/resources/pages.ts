import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'
import { getDevPages } from '../utils'

export default ({
  uri: 'resource://nuxt-ai-ready/pages',
  name: 'All Pages',
  description: 'Page routes from sitemap/routes. In dev mode, returns JSON (TOON format unavailable until build).',
  metadata: {
    mimeType: 'application/json',
  },
  async handler(uri: URL) {
    const pages = await getDevPages()
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(pages, null, 2),
      }],
    }
  },
} satisfies McpResourceDefinition)
