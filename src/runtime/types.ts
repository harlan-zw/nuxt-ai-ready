import type { H3Event } from 'h3'
import type { MdreamOptions } from 'mdream'
import type { SiteToolName } from './site-tool-catalog'

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
  mdreamOptions?: MdreamOptions

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
     * Emit the draft Content-Usage robots.txt directive.
     * Set to false to avoid robots.txt validators that do not support it yet.
     * @default true
     */
    contentUsage?: boolean
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
   * WebMCP: register tools with in-browser AI agents via `document.modelContext`,
   * so an agent on the page can search and read content without crawling it.
   *
   * Enabling this also auto-imports the `useWebMcpTool()` composable for your
   * own tools. Set `siteTools: false` to register nothing but your own.
   * @see https://developer.chrome.com/docs/ai/webmcp
   * @default false
   */
  webmcp?: boolean | {
    /**
     * Register the built-in `list_pages`, `search_pages` and `get_page_markdown` tools
     * @default true
     */
    siteTools?: boolean | SiteToolName[]
    /**
     * Characters a single tool response may return before it is truncated
     * @default 1500
     */
    maxOutputChars?: number
    /**
     * Results returned by `search_pages` by default
     * @default 10
     */
    searchLimit?: number
    /**
     * Default trusted origins for built-in and custom tools.
     * Per-tool composable options take precedence.
     * @default undefined (same-origin only)
     */
    exposedTo?: string[]
  }

  /**
   * Cache duration for llms.txt in seconds (runtime generation)
   * Set to 0 to disable caching
   * @default 600 (10 minutes)
   */
  llmsTxtCacheSeconds?: number

  /**
   * Database configuration for page storage
   * Supports SQLite, LibSQL/Turso, Cloudflare D1, and Neon Postgres
   */
  database?: {
    /**
     * Database type - auto-detected if not specified
     * - 'sqlite': Local SQLite via better-sqlite3 (default for Node.js)
     * - 'd1': Cloudflare D1 (auto-detected on Cloudflare)
     * - 'bun': Bun SQLite via bun:sqlite (auto-detected on Bun) [experimental]
     * - 'libsql': Turso/LibSQL [experimental]
     * - 'neon': Vercel Postgres via Neon serverless (auto-detected on Vercel with POSTGRES_URL) [experimental]
     * @default 'sqlite' (auto-detects based on platform)
     */
    type?: 'sqlite' | 'bun' | 'd1' | 'libsql' | 'neon'
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
     * Database URL for LibSQL/Turso or Neon/Vercel Postgres
     * For Vercel: auto-reads from POSTGRES_URL env var
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
   * When set, requires `Authorization: Bearer <token>` header for poll/prune/indexnow endpoints
   */
  runtimeSyncSecret?: string

  /**
   * Prerender configuration
   */
  prerender?: {
    /**
     * Number of pages to crawl concurrently during build
     * Set to 1 to disable batching
     * @default 10
     */
    concurrency?: number
  }

  /**
   * Enable cron run logging to database for debugging
   */
  debugCron?: boolean

  /**
   * Auto-detect @nuxtjs/i18n (or nuxt-i18n-micro) and integrate locale data into:
   * - llms.txt "Available Languages" header
   * - Markdown response Link headers (hreflang alternates) + frontmatter
   * - Per-page locale persisted in DB for filtered queries
   * - FTS5 tokenizer (auto-switches to trigram when CJK locales are present)
   *
   * Set to `false` to disable auto-detection even when an i18n module is installed.
   * @default true
   */
  autoI18n?: boolean

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

  // --- Deprecated v0 options (removed in next major) ---

  /**
   * @deprecated Use `llmsTxtCacheSeconds` instead. Will be removed in v2.
   */
  cacheMaxAgeSeconds?: number
}

/**
 * Page-level entry for discovery and metadata queries
 */
export interface PageDocument {
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
  /** Locale code (e.g. "en", "fr") when i18n is configured. Empty string when no i18n. */
  locale?: string
}

/**
 * Hook context for markdown processing (Nitro runtime hook)
 *
 * This hook is called during HTML→Markdown conversion in the runtime middleware.
 * You can modify the markdown content before it's returned to the client.
 *
 * @example Modify markdown content
 * nitroApp.hooks.hook('ai-ready:page:markdown', async (context) => {
 *   // Add a footer to all markdown
 *   context.markdown += '\n\n---\n*Generated with mdream*'
 * })
 *
 * @example Track conversions and add headers
 * nitroApp.hooks.hook('ai-ready:page:markdown', async (context) => {
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
  /** Description rendered in the heading-free preamble, or in each optional link note (can be array for multiple paragraphs) */
  description?: string | string[]
  /** The links of the section */
  links?: LlmsTxtLink[]
  /** Mark links as optional per llms.txt spec. Links from all optional sections are flattened under `## Optional`. */
  optional?: boolean
}

/**
 * Structured llms.txt configuration
 */
export interface LlmsTxtConfig {
  /**
   * Rewrite automatically generated page links to their Markdown representation
   * when the final static output contains the file or the deployment retains
   * the runtime Markdown handler.
   * @default false
   */
  markdownLinks?: boolean
  /** The sections of the documentation */
  sections?: LlmsTxtSection[]
  /** Additional heading-free preamble notes rendered before file-list sections */
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
  /** Page headings structure (e.g., [{ "h1": "Title" }, { "h2": "Subtitle" }]) */
  headings: Array<Record<string, string>>
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
