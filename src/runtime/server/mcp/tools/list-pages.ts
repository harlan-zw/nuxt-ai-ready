import { defineMcpTool, jsonResult } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpTool({
  name: 'list_pages',
  description: `Lists all indexed pages from the site with configurable output fields.

WHEN TO USE: Use this tool when you need to DISCOVER or SEARCH for pages. Common scenarios:
- "What pages are available?" - browse all pages
- "Find pages about X topic" - search by title/description
- "Show me the site structure" - explore content organization
- "What documentation exists?" - discover available content

WHEN NOT TO USE: If you already know the exact page route, use get_page directly.

WORKFLOW: This tool returns page metadata (route, title, description, etc.). After finding relevant pages, use get_page to retrieve full content.

FIELD OPTIONS: Control which fields to include in the output:
- route: Page URL path (always included)
- title: Page title
- description: Page meta description
- headings: Document structure (h1, h2, h3, etc.)
- markdown: Full markdown content (warning: can be large, avoid unless needed)
- id: Document identifier
- chunkIds: Associated chunk identifiers`,
  parameters: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        description: 'Fields to include in output. Defaults to [route, title, description]',
        items: {
          type: 'string',
          enum: ['route', 'title', 'description', 'headings', 'markdown', 'id', 'chunkIds'],
        },
        default: ['route', 'title', 'description'],
      },
      search: {
        type: 'string',
        description: 'Optional search term to filter pages by title or description',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of pages to return',
        minimum: 1,
        maximum: 1000,
        default: 100,
      },
    },
  },
  handler: async ({ fields = ['route', 'title', 'description'], search, limit = 100 }) => {
    const searchLower = search?.toLowerCase()
    const result: Array<Record<string, any>> = []
    let total = 0
    let filtered = 0

    // Stream docs, filter and collect up to limit
    for await (const doc of streamBulkDocuments()) {
      total++

      // Apply search filter if provided
      if (searchLower) {
        const matches = doc.title?.toLowerCase().includes(searchLower)
          || doc.description?.toLowerCase().includes(searchLower)
          || doc.route?.toLowerCase().includes(searchLower)

        if (!matches)
          continue
      }

      filtered++

      // Collect up to limit
      if (result.length < limit) {
        const projected: Record<string, any> = { route: doc.route }

        fields.forEach((field) => {
          if (field !== 'route' && field in doc)
            projected[field] = doc[field as keyof typeof doc]
        })

        result.push(projected)
      }
    }

    return jsonResult({
      total,
      filtered,
      pages: result,
    })
  },
})
