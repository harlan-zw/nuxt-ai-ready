import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'
import { getNitroOrigin } from '#site-config/server/composables'
import { useEvent } from 'nitropack/runtime'

export default ({
  uri: 'resource://nuxt-ai-ready/pages',
  name: 'All Pages',
  description: 'Page-level metadata (route, title, description, markdown, headings, chunkIds) in TOON format. Each page includes chunkIds[] array to join with pages-chunks resource for chunk-level content. TOON is token-efficient JSON encoding (see https://toonformat.dev)',
  metadata: {
    mimeType: 'text/toon',
  },
  cache: '1h',
  async handler(uri: URL) {
    const event = useEvent()
    const nitroOrigin = getNitroOrigin(event)
    const text = await $fetch(`/llms.toon`, {
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
