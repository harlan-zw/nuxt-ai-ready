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

  /**
   * Content Signal Directives
   */
  contentSignal?: false | {
    /**
     * Allow Training or fine-tuning AI models.
     */
    aiTrain?: boolean
    /**
     * Allow building a search index and providing search results (e.g., returning hyperlinks and short excerpts from your website's contents).
     * Search does not include providing AI-generated search summaries.
     */
    search?: boolean
    /**
     * Inputting content into one or more AI models (e.g., retrieval augmented generation, grounding, or other real-time taking of content for generative AI search answers).
     */
    aiInput?: boolean
  }

  /**
   * MCP (Model Context Protocol) configuration
   * Control which tools and resources are exposed via MCP
   * @default All enabled when @nuxtjs/mcp-toolkit is installed
   */
  mcp?: {
    /** Enable MCP tools (list-pages) @default true */
    tools?: boolean
    /** Enable MCP resources (pages, pages-chunks) @default true */
    resources?: boolean
  }

  /**
   * Content timestamp tracking configuration
   */
  timestamps?: {
    /**
     * Enable timestamp tracking
     * @default false
     */
    enabled?: boolean

    /**
     * Path to store content hash manifest
     * @default 'node_modules/.cache/nuxt-seo/ai-index/content-hashes.json'
     */
    manifestPath?: string
  }
}

/**
 * Individual chunk entry in llms-full.toon (one per chunk)
 * Used for RAG, embeddings, and semantic search
 * Optimized for token efficiency - join with llms.toon for title/description
 * Chunk index can be inferred from id suffix (e.g., "hash-0", "hash-1")
 * Tabular TOON format (primitives only)
 */
export interface BulkChunk {
  id: string
  route: string
  content: string
}

/**
 * Page-level entry in llms.toon (one per page)
 * Used for page discovery, listing, and metadata queries
 */
export interface BulkDocument {
  /** Page route/path */
  route: string
  /** Page title */
  title: string
  /** Page description */
  description: string
  /** Full markdown content reassembled from chunks */
  markdown: string
  /** Page headings structure (e.g., [{ "h1": "Title" }, { "h2": "Subtitle" }]) */
  headings: Array<Record<string, string>>
  /** All chunk IDs for this page (first ID can be used as document ID) */
  chunkIds: string[]
  /** ISO 8601 timestamp of last content update */
  updatedAt?: string
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
