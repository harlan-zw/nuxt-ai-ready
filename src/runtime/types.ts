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
    /** Enable MCP resources (pages) @default true */
    resources?: boolean
  }

  /**
   * Cache duration for llms.txt in seconds (runtime generation)
   * Set to 0 to disable caching
   * @default 600 (10 minutes)
   */
  cacheMaxAgeSeconds?: number

  /**
   * Database configuration for page storage
   * Uses db0 for cross-platform SQLite support
   */
  database?: {
    /**
     * Database type - auto-detected if not specified
     * @default 'sqlite' (auto-detects best connector)
     */
    type?: 'sqlite' | 'd1' | 'libsql'
    /**
     * SQLite filename (relative to rootDir or absolute)
     * @default '.data/ai-ready/pages.db'
     */
    filename?: string
    /**
     * D1 binding name for Cloudflare Workers/Pages
     * @default 'AI_READY_DB'
     */
    bindingName?: string
    /**
     * LibSQL/Turso URL
     */
    url?: string
    /**
     * LibSQL/Turso auth token
     */
    authToken?: string
  }

  /**
   * Enable scheduled cron task (runs every minute)
   * When true, automatically enables runtimeSync for background indexing
   * Also runs IndexNow sync if indexNow is enabled
   */
  cron?: boolean

  /**
   * Enable IndexNow for instant search engine notifications
   * Submits to Bing, Yandex, Naver, Seznam when content changes
   * Set to `true` to derive key from site URL, or provide your own string
   */
  indexNow?: boolean | string

  /**
   * Secret token for authenticating runtime sync endpoints
   * When set, requires ?secret=<token> query param for poll/prune/indexnow endpoints
   */
  runtimeSyncSecret?: string

  /**
   * Enable cron run logging to database for debugging
   * Logs each cron execution with results (indexed, submitted, errors)
   * Auto-prunes entries older than 24 hours
   */
  debugCron?: boolean

  /**
   * Runtime sync configuration (opt-in for dynamic content sites)
   * When enabled, pages are re-indexed at runtime from sitemap
   * Set to `true` for defaults or object to customize
   * @default false - prerendered data is used
   */
  runtimeSync?: boolean | {
    /**
     * TTL for refresh in seconds (sitemap + page re-indexing)
     * Controls how often to refresh sitemap routes and re-index stale pages
     * @default 3600 (1 hour)
     */
    ttl?: number
    /**
     * Pages to index per batch
     * @default 20
     */
    batchSize?: number
    /**
     * TTL for pruning stale routes in seconds
     * Routes not seen in sitemap for longer than this are deleted
     * 0 = never prune (default)
     * @default 0
     */
    pruneTtl?: number
  }
}

/**
 * Page-level entry for discovery and metadata queries
 */
export interface BulkDocument {
  /** Page route/path */
  route: string
  /** Page title */
  title: string
  /** Page description */
  description: string
  /** Full markdown content */
  markdown: string
  /** Page headings structure (e.g., [{ "h1": "Title" }, { "h2": "Subtitle" }]) */
  headings: Array<Record<string, string>>
  /** Top keywords for search (from meta keywords or extracted from content) */
  keywords?: string[]
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
 * nitroApp.hooks.hook('ai-ready:markdown', async (context) => {
 *   // Add a footer to all markdown
 *   context.markdown += '\n\n---\n*Generated with mdream*'
 * })
 *
 * @example Track conversions and add headers
 * nitroApp.hooks.hook('ai-ready:markdown', async (context) => {
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
 * Context for runtime page indexing hook
 */
export interface PageIndexedContext {
  /** The route that was indexed */
  route: string
  /** Page title */
  title: string
  /** Page description */
  description: string
  /** Page headings as JSON string */
  headings: string
  /** Top keywords for search */
  keywords: string[]
  /** Full markdown content */
  markdown: string
  /** ISO timestamp */
  updatedAt: string
  /** Whether this is a new page or an update */
  isUpdate: boolean
  /** Whether the content hash changed (triggers IndexNow sync) */
  contentChanged: boolean
}
