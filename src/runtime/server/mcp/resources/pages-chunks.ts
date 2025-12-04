import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'

export default ({
  uri: 'resource://nuxt-ai-ready/pages-chunks',
  name: 'All Page Chunks',
  description: 'Chunk-level content (id, route, content) in TOON format for RAG/embeddings. Join with pages resource using id field - match chunk.id with page.chunkIds[] to get title, description, headings. TOON is token-efficient JSON encoding (see https://toonformat.dev)',
  metadata: {
    mimeType: 'text/plain',
  },
  cache: '1h',
  async handler(uri: URL) {
    const response = await fetch('/llms-full.toon')
    if (!response.ok)
      throw new Error(`Failed to fetch chunks: ${response.statusText}`)

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
