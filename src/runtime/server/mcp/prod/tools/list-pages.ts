import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { getNitroOrigin } from '#site-config/server/composables'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { toonResult } from '../../utils'

const schema = {
  mode: z.enum(['chunks', 'minimal'])
    .default('minimal')
    .describe('Return individual content chunks (chunks) or page-level metadata (minimal)'),
}

/**
 * Lists all pages by fetching and returning TOON-encoded data
 * TOON (Token-Oriented Object Notation) is a compact encoding that minimizes tokens for LLM input
 * See https://toonformat.dev
 */
export default {
  name: 'list_pages',
  description: 'Lists all available pages in TOON format (token-efficient). Use "chunks" mode to get individual content chunks, or "minimal" for page-level metadata.',
  inputSchema: schema,
  cache: '1h',
  async handler({ mode }) {
    // Fetch and return TOON-encoded file directly (token-efficient format)
    const event = useEvent()
    const nitroOrigin = getNitroOrigin(event)
    const text = await $fetch(mode === 'chunks' ? '/llms-full.toon' : '/llms.toon', {
      baseURL: nitroOrigin,
    })
    return toonResult(text)
  },
} satisfies McpToolDefinition
