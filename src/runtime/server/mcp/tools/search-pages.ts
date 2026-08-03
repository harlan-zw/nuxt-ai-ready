import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import siteTools from '#ai-ready-virtual/site-tools.mjs'
import { SITE_TOOL_CATALOG } from '../../../site-tool-catalog'
import { searchPages } from '../../db/queries'

const inputSchema = {
  query: z.string().describe(SITE_TOOL_CATALOG.search_pages.parameters.query),
  limit: z.number().int().min(1).max(50).optional().default(siteTools.searchPages.defaultLimit).describe(
    `${SITE_TOOL_CATALOG.search_pages.parameters.limit} Defaults to ${siteTools.searchPages.defaultLimit}.`,
  ),
}

const tool: McpToolDefinition<typeof inputSchema> = {
  name: SITE_TOOL_CATALOG.search_pages.name,
  title: SITE_TOOL_CATALOG.search_pages.title,
  description: SITE_TOOL_CATALOG.search_pages.description,
  inputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  enabled: () => siteTools.searchPages.mcp.enabled,
  cache: '5m',
  async handler({ query, limit }) {
    const event = useEvent()
    const results = await searchPages(event, query, { limit })
    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  },
}

export default tool
