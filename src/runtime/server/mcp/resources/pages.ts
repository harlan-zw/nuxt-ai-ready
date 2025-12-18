import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'
import { getPagesList } from '../../utils/pageData'

export default ({
  uri: 'resource://nuxt-ai-ready/pages',
  name: 'All Pages',
  description: 'Page listing as JSON.',
  metadata: {
    mimeType: 'application/json',
  },
  cache: '1h',
  async handler(uri: URL) {
    const pages = await getPagesList()
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(pages),
      }],
    }
  },
} satisfies McpResourceDefinition)
