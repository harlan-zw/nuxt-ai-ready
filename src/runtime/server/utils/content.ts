import type { H3Event } from 'h3'
import { lookupContentPage } from '#ai-ready-virtual/content-lookup.mjs'

export interface ContentPageResult {
  markdown: string
  title?: string
  description?: string
  updatedAt?: string
}

// Look up a route in @nuxt/content's page collections and return the source
// markdown (AST → minimark stringify). Returns null when content isn't
// installed, or when no page collection contains the path.
export async function tryGetContentMarkdown(event: H3Event, path: string): Promise<ContentPageResult | null> {
  return lookupContentPage(event, path)
}
