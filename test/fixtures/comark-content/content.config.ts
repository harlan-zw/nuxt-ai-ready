import { defineCollection, defineContentConfig } from '@harlan-zw/comark-content'

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: {
        include: 'docs/**/*.md',
        // Without a prefix the collection keys pages at /api, while the pages
        // themselves live at /docs/api, and no lookup ever matches.
        prefix: '/docs',
      },
    }),
  },
})
