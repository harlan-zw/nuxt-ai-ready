// @ts-expect-error untyped
import { defineMcpPrompt } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpPrompt({
  name: 'explain_concept',
  description: 'Get a detailed explanation of a concept by finding and reading relevant pages',
  arguments: [
    {
      name: 'concept',
      description: 'The concept or feature to explain',
      required: true,
    },
    {
      name: 'level',
      description: 'Explanation level: beginner, intermediate, or advanced',
      required: false,
    },
  ],
  // @ts-expect-error untyped
  handler: async ({ concept, level = 'intermediate' }) => {
    const searchLower = concept.toLowerCase()
    const seenRoutes = new Set<string>()
    const relevantPages: Array<{ route: string, title?: string, description?: string }> = []

    // Stream docs, deduplicate and collect up to 10
    for await (const doc of streamBulkDocuments()) {
      // Skip duplicates
      if (seenRoutes.has(doc.route))
        continue

      // Filter by search term
      const matches = doc.title?.toLowerCase().includes(searchLower)
        || doc.description?.toLowerCase().includes(searchLower)
        || doc.route?.toLowerCase().includes(searchLower)

      if (matches) {
        seenRoutes.add(doc.route)
        relevantPages.push({
          route: doc.route,
          title: doc.title,
          description: doc.description,
        })

        // Early exit when limit reached
        if (relevantPages.length >= 10)
          break
      }
    }

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please explain "${concept}" at a ${level} level.

Here are the relevant pages found: ${JSON.stringify(relevantPages, null, 2)}

Please:
1. Use get_page to read the most relevant pages (top 2-3)
2. Synthesize the information to create an explanation that:
   - Provides clear definitions
   - Includes practical examples from the pages
   - Explains use cases
   - Mentions related concepts
   - References the specific pages used

Tailor the explanation for a ${level} audience.`,
          },
        },
      ],
    }
  },
})
