import type { McpToolDefinition } from '@nuxtjs/mcp-toolkit'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import siteTools from '#ai-ready-virtual/site-tools.mjs'
import { normalizeSiteRoute, SITE_TOOL_CATALOG } from '../../../site-tool-catalog'
import { queryPages } from '../../db/queries'

const inputSchema = {
  route: z.string().describe(SITE_TOOL_CATALOG.get_page_markdown.parameters.route),
}

const tool: McpToolDefinition<typeof inputSchema> = {
  name: SITE_TOOL_CATALOG.get_page_markdown.name,
  title: SITE_TOOL_CATALOG.get_page_markdown.title,
  description: SITE_TOOL_CATALOG.get_page_markdown.description,
  inputSchema,
  annotations: { readOnlyHint: true, openWorldHint: false },
  enabled: () => siteTools.getPageMarkdown.mcp.enabled,
  cache: '5m',
  async handler({ route }) {
    const path = normalizeSiteRoute(route)
    if (!path) {
      return {
        content: [{ type: 'text', text: 'A site route is required, such as /about. Call list_pages to see the available routes.' }],
        isError: true,
      }
    }

    const page = await queryPages(useEvent(), { route: path, includeMarkdown: true })
    if (!page) {
      return {
        content: [{ type: 'text', text: `No indexed page found at ${path}. Call search_pages or list_pages to find the correct route.` }],
        isError: true,
      }
    }
    return page.markdown
  },
}

export default tool
