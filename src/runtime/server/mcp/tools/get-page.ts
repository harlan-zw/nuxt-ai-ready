import { defineMcpTool, errorResult, jsonResult } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpTool({
  name: 'get_page',
  description: `Retrieves the full content and details of a specific page by its route.

WHEN TO USE: Use this tool when you know the EXACT route to a page. Common scenarios:
- User asks for a specific page: "Get the /about page"
- You found a relevant route from list_pages and want full content
- You need complete page details including markdown content

WHEN NOT TO USE: If you don't know the exact route, use list_pages first to discover available pages.

OUTPUT: Returns complete page data including:
- route: Page URL path
- title: Page title
- description: Page meta description
- markdown: Full markdown content
- headings: Document structure
- id: Document identifier
- chunkIds: Associated chunk identifiers`,
  parameters: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        description: 'The exact route/path to the page (e.g., "/docs/getting-started", "/about", "/blog/my-post")',
      },
    },
    required: ['route'],
  },
  handler: async ({ route }) => {
    // Normalize route (ensure leading slash, no trailing slash)
    const normalizedRoute = route.startsWith('/') ? route : `/${route}`
    const cleanRoute = normalizedRoute.replace(/\/$/, '') || '/'

    // Stream docs and early-exit when found
    for await (const doc of streamBulkDocuments()) {
      const docRoute = doc.route?.replace(/\/$/, '') || '/'
      if (docRoute === cleanRoute || doc.route === route)
        return jsonResult(doc)
    }

    return errorResult(`Page not found: ${route}. Use list_pages to discover available pages.`)
  },
})
