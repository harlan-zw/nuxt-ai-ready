// @ts-expect-error untyped
import { defineMcpPrompt } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpPrompt({
  name: 'browse_pages',
  description: 'Browse and discover pages by topic, with results ready for exploration',
  arguments: [
    {
      name: 'topic',
      description: 'Topic or keyword to search for in page titles/descriptions',
      required: true,
    },
    {
      name: 'maxResults',
      description: 'Maximum number of pages to retrieve',
      required: false,
    },
  ],
  // @ts-expect-error untyped
  handler: async ({ topic, maxResults = 10 }) => {
    const searchLower = topic.toLowerCase()
    const seenRoutes = new Set<string>()
    const filteredPages: Array<{ route: string, title?: string, description?: string }> = []
    let total = 0

    // Stream docs, deduplicate and collect up to limit
    for await (const doc of streamBulkDocuments()) {
      total++

      // Skip duplicates
      if (seenRoutes.has(doc.route))
        continue

      // Filter by search term
      const matches = doc.title?.toLowerCase().includes(searchLower)
        || doc.description?.toLowerCase().includes(searchLower)
        || doc.route?.toLowerCase().includes(searchLower)

      if (matches) {
        seenRoutes.add(doc.route)
        filteredPages.push({
          route: doc.route,
          title: doc.title,
          description: doc.description,
        })

        // Early exit when limit reached
        if (filteredPages.length >= maxResults)
          break
      }
    }

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Help the user find pages about: "${topic}"

Here are ${filteredPages.length} pages found (out of ${total} total pages): ${JSON.stringify(filteredPages, null, 2)}

Please:
1. Review the filtered results and identify the most relevant pages
2. If specific pages look relevant, use get_page to retrieve their full content
3. Summarize findings and reference the source pages`,
          },
        },
      ],
    }
  },
})
