// @ts-expect-error untyped
import { defineMcpResource, jsonResult } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpResource({
  uri: 'pages://list',
  name: 'All Pages',
  description: 'Complete list of all indexed pages with basic metadata (route, title, description)',
  mimeType: 'application/json',
  handler: async () => {
    const pages: Array<{ route: string, title?: string, description?: string, id?: string }> = []

    // Stream docs and build lightweight list
    for await (const doc of streamBulkDocuments()) {
      pages.push({
        route: doc.route,
        title: doc.title,
        description: doc.description,
        id: doc.id,
      })
    }

    return jsonResult({
      total: pages.length,
      pages,
    })
  },
})
