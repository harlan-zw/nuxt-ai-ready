import { defineMcpPrompt } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpPrompt({
  name: 'find_information',
  description: 'Find information about a specific topic by searching site pages and retrieving relevant content',
  arguments: [
    {
      name: 'topic',
      description: 'Topic, feature, or question to find information about',
      required: true,
    },
    {
      name: 'detail',
      description: 'Level of detail needed: summary, detailed, or comprehensive',
      required: false,
    },
  ],
  handler: async ({ topic, detail = 'detailed' }) => {
    const searchLower = topic.toLowerCase()
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
            text: `Help me find information about: "${topic}"

Here are the relevant pages found: ${JSON.stringify(relevantPages, null, 2)}

Please:
1. Review the page titles and descriptions to identify the most relevant ones
2. Use get_page to retrieve full content of the top 2-3 most relevant pages
3. ${detail === 'summary' ? 'Provide a concise summary (2-3 paragraphs)' : detail === 'comprehensive' ? 'Provide a comprehensive explanation with all details and examples from the pages' : 'Provide a detailed explanation covering the key points'}
4. Always cite which pages the information came from`,
          },
        },
      ],
    }
  },
})
