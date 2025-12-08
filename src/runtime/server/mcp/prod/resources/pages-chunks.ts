import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'
import { getNitroOrigin } from '#site-config/server/composables'
import { useEvent } from 'nitropack/runtime'

export default ({
  uri: 'resource://nuxt-ai-ready/pages-chunks',
  name: 'All Page Chunks',
  description: 'Chunk-level content (id, route, content) in TOON format for RAG/embeddings. Join with pages resource using id field - match chunk.id with page.chunkIds[] to get title, description, headings. TOON is token-efficient JSON encoding (see https://toonformat.dev)',
  metadata: {
    mimeType: 'text/toon',
  },
  cache: '1h',
  async handler(uri: URL) {
    const event = useEvent()
    const nitroOrigin = getNitroOrigin(event)
    const text = await $fetch(`/llms-full.toon`, {
      baseURL: nitroOrigin,
    })
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'text/toon',
        text,
      }],
    }
  },
} satisfies McpResourceDefinition)
