import type { H3Event } from 'h3'
import type { MdreamOptions } from 'mdream'
import type { SiteToolsConfig } from './site-tool-config'

export type ContentNegotiationPolicy = 'auto' | 'enabled' | 'disabled'

export interface ApiCatalogLinkTarget {
  /** Target URI. Relative values resolve against the deployed site URL. */
  href: string
  /** Media type of the target resource. */
  type?: string
  /** Human-readable target label. */
  title?: string
  /** Language tag or tags for the target resource. */
  hreflang?: string | string[]
  /** Media query describing where the target applies. */
  media?: string
}

export type ApiCatalogLinks = ApiCatalogLinkTarget | ApiCatalogLinkTarget[]

export interface ApiCatalogEntry {
  /** API endpoint or link context URI. */
  anchor: string
  /** API endpoints that belong to this catalog. */
  item?: ApiCatalogLinks
  /** Machine-readable API descriptions, such as OpenAPI documents. */
  serviceDesc?: ApiCatalogLinks
  /** Human-readable API documentation. */
  serviceDoc?: ApiCatalogLinks
  /** API metadata, such as policies or licensing information. */
  serviceMeta?: ApiCatalogLinks
  /** API status or health resources. */
  status?: ApiCatalogLinks
  /** Nested API catalogs. */
  apiCatalog?: ApiCatalogLinks
  /** Additional RFC 8288 link relations. */
  relations?: Record<string, ApiCatalogLinks>
}

export interface ApiCatalogConfig {
  /** Entries published in the RFC 9727 Linkset document. */
  entries?: ApiCatalogEntry[]
}

export interface LocalAgentSkillConfig {
  /** Read and embed a SKILL.md file during Nuxt setup. */
  source: 'local'
  /** Agent Skills identifier. */
  name: string
  /** Short activation guidance, up to 1024 characters. */
  description: string
  /** SKILL.md path, resolved relative to the Nuxt root directory. */
  file: string
}

export interface ExternalAgentSkillConfig {
  /** Advertise an artifact already hosted at a URL. */
  source: 'external'
  /** Agent Skills identifier. */
  name: string
  /** Artifact distribution type. */
  type: 'skill-md' | 'archive'
  /** Short activation guidance, up to 1024 characters. */
  description: string
  /** Absolute, path-absolute, or index-relative artifact URL. */
  url: string
  /** SHA-256 digest of the artifact's raw bytes. */
  digest: `sha256:${string}`
}

export type AgentSkillConfig = LocalAgentSkillConfig | ExternalAgentSkillConfig

export interface AgentSkillsConfig {
  skills: AgentSkillConfig[]
}

export interface AgentSkillsIndexEntry {
  name: string
  type: 'skill-md' | 'archive'
  description: string
  url: string
  digest: `sha256:${string}`
}

export interface AgentSkillsIndex {
  $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json'
  skills: AgentSkillsIndexEntry[]
}

export interface McpServerCardConfig {
  /** Human-readable title included in serverInfo. */
  title?: string
  /** Override the description derived from MCP Toolkit or site config. */
  description?: string
  /** Override the instructions derived from MCP Toolkit. */
  instructions?: string
  /** Public HTTP(S) icon URL. Defaults to the first MCP Toolkit icon. */
  iconUrl?: string
  /** Public HTTP(S) documentation URL. */
  documentationUrl?: string
  /** Discovery response cache lifetime in seconds. @default 3600 */
  cacheMaxAge?: number
}

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
   * Negotiate Markdown on HTML routes through Accept and User-Agent headers.
   * Disable when a deployment cache cannot vary responses by request headers.
   * Explicit .md routes remain available.
   * @default Automatic per route
   */
  contentNegotiation?: boolean

  /**
   * Publish an RFC 9727 API Catalog at `/.well-known/api-catalog`.
   * Relative entry URLs resolve against the configured site URL and app base URL.
   * Set to false to suppress both configured and automatically generated entries.
   * @default undefined
   */
  apiCatalog?: false | ApiCatalogConfig

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
    /** Attach enabled site tools to MCP Toolkit. @default true */
    tools?: boolean
    /** Enable MCP resources (pages) @default true */
    resources?: boolean
  }

  /**
   * Publish MCP Server Card discovery metadata for the runtime MCP server.
   * Enabled automatically when @nuxtjs/mcp-toolkit registers a runtime server.
   * Set to false to disable.
   */
  mcpServerCard?: false | McpServerCardConfig

  /**
   * Configure the built-in site tools once, then attach them to MCP, WebMCP,
   * or both through each tool's transport options.
   */
  tools?: SiteToolsConfig

  /**
   * WebMCP: register tools with in-browser AI agents via `document.modelContext`,
   * so an agent on the page can search and read content without crawling it.
   *
   * Enabling this also auto-imports the `useWebMcpTool()` composable for your
   * own tools. Set `tools: false` to register nothing but your own.
   * @see https://developer.chrome.com/docs/ai/webmcp
   * @default false
   */
  webmcp?: boolean | {
    /**
     * Attach enabled built-in tools to WebMCP.
     * @default true
     */
    tools?: boolean
    /**
     * Default trusted origins for built-in and custom tools.
     * Per-tool composable options take precedence.
     * @default undefined (same-origin only)
     */
    exposedTo?: string[]
  }

  /**
   * Publish an Agent Skills Discovery v0.2.0 index and optionally host local
   * SKILL.md artifacts under `/.well-known/agent-skills/`.
   * @default false
   */
  agentSkills?: false | AgentSkillsConfig

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
