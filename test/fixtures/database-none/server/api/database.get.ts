import { countPages, queryPages, searchPages, streamPages } from '#ai-ready'
import { defineEventHandler } from '#nuxtseo/h3'

export default defineEventHandler(async (event) => {
  const streamed = []
  for await (const page of streamPages(event))
    streamed.push(page)
  return {
    pages: await queryPages(event),
    page: await queryPages(event, { route: '/about', includeMarkdown: true }) ?? null,
    count: await countPages(event),
    search: await searchPages(event, 'Technology'),
    streamed,
  }
})
