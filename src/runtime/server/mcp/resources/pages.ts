import type { McpResourceDefinition } from '@nuxtjs/mcp-toolkit'
import type { PageEntry } from '../../db/queries'
import { useEvent } from 'nitropack/runtime'
import { queryPages } from '../../db/queries'

export default ({
  uri: 'resource://nuxt-ai-ready/pages',
  name: 'All Pages',
  description: 'Page listing as JSON.',
  metadata: {
    mimeType: 'application/json',
  },
  cache: '1h',
  async handler(uri: URL) {
    const event = useEvent()
    const pages = await queryPages(event) as PageEntry[]
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(pages.map(p => ({
          route: p.route,
          title: p.title || p.route,
          description: p.description || '',
          headings: p.headings || undefined,
          keywords: p.keywords?.length ? p.keywords : undefined,
        }))),
      }],
    }
  },
} satisfies McpResourceDefinition)
