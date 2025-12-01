import type { H3Event } from 'h3'
import type { HTMLToMarkdownOptions } from 'mdream'

export interface ModuleOptions {
  /**
   * Enable/disable module
   * @default true
   */
  enabled?: boolean

  /**
   * Debug mode
   * @default false
   */
  debug?: boolean

  /**
   * Bulk data API (JSONL streaming)
   * @default '/_ai-ready/bulk'
   */
  bulkRoute: string | false

  /**
   * Options to pass to mdream htmlToMarkdown function
   */
  mdreamOptions?: HTMLToMarkdownOptions & {
    /**
     * Preset to apply to the htmlToMarkdown function
     */
    preset?: 'minimal'
  }

  /**
   * Cache configuration
   */
  markdownCacheHeaders?: {
    /**
     * Cache duration in seconds
     * @default 3600 (1 hour)
     */
    maxAge?: number
    /**
     * Enable stale-while-revalidate
     * @default true
     */
    swr?: boolean
  }

  /**
   * Structured llms.txt configuration
   */
  llmsTxt?: LlmsTxtConfig
}

/**
 * Individual chunk entry in bulk.jsonl (one per chunk)
 * Consumers can reassemble by route if needed
 */
export interface BulkChunk {
  id: string
  route: string
  chunkIndex: number
  content: string
  headers?: Record<string, string>
  loc?: {
    lines: {
      from: number
      to: number
    }
  }
  // Document-level metadata (same across all chunks for a route)
  title: string
  description: string
}

/**
 * Hook context for markdown processing (Nitro runtime hook)
 *
 * This hook is called during HTML→Markdown conversion in the runtime middleware.
 * You can modify the markdown content before it's returned to the client.
 *
 * @example Modify markdown content
 * nitroApp.hooks.hook('mdream:markdown', async (context) => {
 *   // Add a footer to all markdown
 *   context.markdown += '\n\n---\n*Generated with mdream*'
 * })
 *
 * @example Track conversions and add headers
 * nitroApp.hooks.hook('mdream:markdown', async (context) => {
 *   console.log(`Converted ${context.route} (${context.title})`)
 *
 *   // Add custom headers
 *   if (context.event) {
 *     setHeader(context.event, 'X-Markdown-Title', context.title)
 *   }
 * })
 */
export interface MarkdownContext {
  /** The original HTML content */
  html: string
  /** The generated markdown content - modify this to change output */
  markdown: string
  /** The route being processed (e.g., '/about') */
  route: string
  /** The page title extracted from HTML */
  title: string
  /** Page description extracted from meta tags or content */
  description: string
  /** Whether this is during prerendering (true) or runtime (false) */
  isPrerender: boolean
  /** The H3 event object for accessing request/response */
  event: H3Event
}

/**
 * Link in llms.txt section
 */
export interface LlmsTxtLink {
  /** The title of the link */
  title: string
  /** The description of the link */
  description?: string
  /** The href of the link */
  href: string
}

/**
 * Section in llms.txt
 */
export interface LlmsTxtSection {
  /** The title of the section */
  title: string
  /** The description of the section (can be array for multiple paragraphs) */
  description?: string | string[]
  /** The links of the section */
  links?: LlmsTxtLink[]
}

/**
 * Structured llms.txt configuration
 */
export interface LlmsTxtConfig {
  /** The sections of the documentation */
  sections?: LlmsTxtSection[]
  /** Notes section (always appears at the end) */
  notes?: string | string[]
}

/**
 * Hook context for chunk processing (Nitro build-time hook)
 *
 * Called during prerender for each generated chunk, allowing modules
 * to implement RAG tooling (e.g., vector embeddings, search indexing)
 *
 * @example Process chunks for vector search
 * nitro.hooks.hook('ai-ready:chunk', async (context) => {
 *   const embedding = await generateEmbedding(context.chunk.content)
 *   await vectorDb.insert({
 *     id: context.chunk.id,
 *     embedding,
 *     metadata: {
 *       route: context.route,
 *       title: context.title,
 *     }
 *   })
 * })
 */
export interface ChunkContext {
  /** The chunk data that will be written to bulk JSONL */
  chunk: BulkChunk
  /** The route being processed (e.g., '/about') */
  route: string
  /** Page title extracted from HTML */
  title: string
  /** Page description from meta tags */
  description: string
  /** Headings extracted from the page */
  headings: Array<Record<string, string>>
}
