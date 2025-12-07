import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'

export default ({
  uri: 'resource://nuxt-ai-ready/pages',
  name: 'All Pages',
  description: 'Page-level metadata (route, title, description, markdown, headings, chunkIds) in TOON format. Each page includes chunkIds[] array to join with pages-chunks resource for chunk-level content. TOON is token-efficient JSON encoding (see https://toonformat.dev)',
  metadata: {
    mimeType: 'text/plain',
  },
  cache: '1h',
  async handler(uri: URL) {
    const response = await fetch('/llms.toon')
    if (!response.ok)
      throw new Error(`Failed to fetch pages: ${response.statusText}`)

    const text = await response.text()

    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'text/plain',
        text,
      }],
    }
  },
} satisfies McpResourceDefinition)
