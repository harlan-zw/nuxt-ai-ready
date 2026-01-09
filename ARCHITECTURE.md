# Architecture

nuxt-ai-ready is a Nuxt module that makes websites discoverable by AI agents through standardized APIs (llms.txt, MCP) and markdown conversion.

## High-Level Data Flow

```
BUILD TIME (Prerender)
──────────────────────────────────────────────────────────────────────────

1. Nuxt plugin queues .md routes for each rendered page
   └─► /about/ → /about/index.md

2. markdown.prerender middleware intercepts .md requests:
   └─► Fetch HTML → convert to markdown + metadata → return JSON

3. prerender:generate hook processes each .md file:
   ├─► Parse JSON (markdown, title, description, headings, updatedAt)
   ├─► Call ai-ready:page:markdown hook
   ├─► Append to page-data.jsonl
   ├─► Stream-append to llms-full.txt
   └─► Replace route.contents with raw markdown

4. prerender:done or sitemap:prerender:done:
   └─► Prerender /llms.txt via route handler (reads JSONL)

RUNTIME
──────────────────────────────────────────────────────────────────────────

Static files served by Nitro:
• /llms.txt        - page listing (route, title)
• /llms-full.txt   - full markdown content per page

markdown.ts middleware (Accept: text/markdown or *.md):
└─► Live HTML→markdown conversion with hooks

MCP Server (via @nuxtjs/mcp-toolkit):
• list_pages tool       - returns page metadata as JSON
• search_pages tool     - FTS5 full-text search
• pages resource        - returns page listing as JSON

Database (SQLite via db0, tables prefixed `ai_ready_`):
• Pages indexed on visit via afterResponse hook
• FTS5 full-text search for MCP tools (`ai_ready_pages_fts`)
• Compressed dump for serverless cold start restore
```

## Directory Structure

```
src/
├── module.ts                 # Nuxt module entry - hooks, config, handlers
├── prerender.ts              # Build-time llms.txt/llms-full.txt generation
├── kit.ts                    # License verification, preset detection
├── logger.ts                 # Build-time logger (@nuxt/kit)
├── types.ts                  # Re-exports runtime types

└── runtime/
    ├── types.ts              # Public types (ModuleOptions, BulkDocument, etc)
    ├── llms-txt-utils.ts     # buildLlmsTxt, normalizeLlmsTxtConfig

    ├── nuxt/plugins/
    │   └── md-hints.prerender.ts  # Queues .md routes during app:rendered

    └── server/
        ├── middleware/
        │   ├── markdown.prerender.ts  # Prerender: HTML→JSON (markdown+meta)
        │   └── markdown.ts            # Runtime: HTML→markdown with hooks
        │
        ├── routes/
        │   ├── llms.txt.get.ts        # Route handler calling buildLlmsTxt
        │   └── llms-full.txt.get.ts   # Placeholder (static file at runtime)
        │
        ├── db/
        │   ├── index.ts       # useDatabase() singleton
        │   ├── schema.ts      # SQLite schema (ai_ready_pages, ai_ready_pages_fts)
        │   ├── queries.ts     # getAllPages, searchPages, upsertPage, etc
        │   └── dump.ts        # Export/import compressed dumps
        │
        ├── plugins/
        │   ├── db-restore.ts  # Restore dump on cold start
        │   └── page-indexer.ts # Index pages via afterResponse
        │
        ├── utils/
        │   ├── pageData.ts    # getPages/getPagesList - read from database
        │   ├── indexPage.ts   # Manual indexing utilities
        │   └── sitemap.ts     # fetchSitemapUrls - parse /sitemap.xml
        │
        ├── utils.ts           # convertHtmlToMarkdown, getMarkdownRenderInfo
        ├── logger.ts          # Runtime logger (consola)
        │
        └── mcp/
            ├── tools/
            │   ├── list-pages.ts    # list_pages MCP tool
            │   └── search-pages.ts  # search_pages MCP tool (FTS5)
            └── resources/
                └── pages.ts         # pages MCP resource
```

## Module Entry (`module.ts`)

Setup sequence:

1. **Validates config** - checks enabled flag, sets debug level
2. **Installs dependencies** - nuxt-site-config for site metadata
3. **Sets up aliases** - `#ai-ready` → `./runtime`
4. **Configures robots.txt** - content signal directives if configured
5. **Builds llms.txt config** - merges defaults with user config, calls `ai-ready:llms-txt` hook
6. **Virtual modules** - page data accessible via `#ai-ready-virtual/page-data.mjs`
7. **Registers handlers**:
   - markdown.prerender middleware (prerender only)
   - markdown middleware (runtime)
   - /llms.txt and /llms-full.txt route handlers
   - MCP tools/resources via `mcp:definitions:paths` hook
8. **Adds prerender plugin** - queues .md routes during build
9. **Sets up prerender hooks** - calls `setupPrerenderHandler()` for static builds
10. **Configures route rules** - Content-Type headers for .txt/.md files

### Nuxt Hooks

```typescript
'ai-ready:page:markdown' // Called per page during prerender (route, markdown, title, description)
'ai-ready:llms-txt' // Modify llms.txt sections before finalization
```

### Nitro Hooks

```typescript
'ai-ready:markdown' // Modify markdown output at runtime
'ai-ready:mdreamConfig' // Modify mdream options per-request
'ai-ready:page:indexed' // Called when page indexed at runtime (route, title, description, markdown)
```

## Prerender Pipeline (`prerender.ts`)

Called via `nitro:init` hook when building static sites.

### Hook Execution Order

```
1. nitro:init
   └─► Sets up prerender:generate, prerender:done, sitemap:prerender:done hooks
   └─► Creates crawler state with paths for page-data.jsonl and llms-full.txt

2. app:rendered (Nuxt plugin)
   └─► Queues .md route for each page (e.g., /about → /about.md)

3. markdown.prerender middleware (per .md file)
   ├─► Fetch HTML page
   ├─► Convert HTML → markdown via mdream
   ├─► Extract title, description, headings, updatedAt
   └─► Return JSON

4. prerender:generate (per .md file)
   ├─► Parse JSON from route.contents
   ├─► Call ai-ready:page:markdown hook
   ├─► Append page data to JSONL file
   ├─► Stream-append to llms-full.txt
   └─► Replace contents with raw markdown

5. prerender:done OR sitemap:prerender:done
   ├─► Crawl sitemap for SSR pages not prerendered
   └─► Prerender /llms.txt → static file
```

### Stream-Based llms-full.txt

Unlike llms.txt (generated at end), llms-full.txt is streamed during prerender:
- Header written at crawler initialization
- Each page appended as it's processed
- No memory accumulation of large content

### Sitemap Hook Detection

`detectSitemapPrerender()` determines which hook to use:
- `useSitemapHook: true` when @nuxtjs/sitemap is installed (uses `sitemap:prerender:done`)
- `usePrerenderHook: true` otherwise (uses `prerender:done`)

When sitemap hook fires, it also processes SSR-only pages from sitemap that weren't prerendered.

## Prerender Plugin (`runtime/nuxt/plugins/md-hints.prerender.ts`)

Runs during `nuxi generate` to queue `.md` routes:

1. Hooks into `app:rendered`
2. For each rendered page URL, queues corresponding `.md` route:
   - `/about/` → `/about/index.md`
   - `/blog` → `/blog.md`
3. markdown.prerender middleware then runs for each queued route

## Markdown Middleware

Two separate middleware files handle prerender vs runtime:

### `markdown.prerender.ts` (prerender only)

During `nuxi generate`:
1. Only runs when `import.meta.prerender` is true
2. Only handles explicit `.md` requests
3. Fetches HTML page internally
4. Calls `convertHtmlToMarkdownMeta()` (no hooks)
5. Returns JSON: `{ markdown, title, description, headings, updatedAt }`

### `markdown.ts` (runtime)

During live server:
1. Detects markdown requests via `getMarkdownRenderInfo()`
2. Fetches HTML page via `event.fetch(path)`
3. Calls `convertHtmlToMarkdown()` with hooks
4. Returns markdown with cache headers

### Request Detection (`getMarkdownRenderInfo`)

Serves markdown when:
- Path ends in `.md` (explicit request), OR
- Accept header includes `*/*` or `text/markdown` AND
- Accept header does NOT include `text/html` AND
- `sec-fetch-dest` header is NOT `document`

This targets API clients (Claude Code, curl, Bun) while excluding browsers.

### Metadata Extraction

Uses mdream's `extractionPlugin` to capture:
- `<title>` → title
- `<meta name="description">` → description
- `h1-h6` → headings array
- `<meta property="article:modified_time">` etc → updatedAt

## llms.txt Generation

### Key Files

**`src/runtime/llms-txt-utils.ts`** - Core build functions:
- `normalizeLlmsTxtConfig()`: Converts `LlmsTxtConfig` to markdown string
- `buildLlmsTxt()`: Assembles full llms.txt from site config + pages + sitemap

**`src/runtime/server/utils/pageData.ts`**:
- `getPages()`: Returns page entries (route, title, description, headings, updatedAt)
- `getPagesList()`: Returns page list for MCP tools/resources

### getPages() Behavior by Environment

```typescript
// Dev: always empty (no page data exists)
if (import.meta.dev)
  return new Map()

// Prerender: read from JSONL file via virtual module
if (import.meta.prerender) {
  const { readPageDataFromFilesystem } = await import('#ai-ready-virtual/read-page-data.mjs')
  return readPageDataFromFilesystem()
}

// Production: read from virtual module (empty - pages in static files)
const m = await import('#ai-ready-virtual/page-data.mjs')
return m.pages
```

### llms.txt.get.ts

Runtime route handler that builds llms.txt:

1. Header: site name, description, canonical URL
2. Sections from `llmsTxtConfig` (LLM Resources, MCP, etc)
3. Adds sitemap and robots.txt links to LLM Resources section
4. Pages section:
   - Gets prerendered pages from `getPages()` (with titles)
   - Gets sitemap URLs for SSR pages
   - Splits into "Prerendered Pages" vs "Other Pages" if mixed

### llms-full.txt.get.ts

Placeholder handler for non-prerendered requests. Actual content is streamed to static file during prerender.

### Virtual Modules

Two virtual modules handle page data:

**`#ai-ready-virtual/read-page-data.mjs`**:
- Reads JSONL file from filesystem during prerender
- Returns array of page data objects

**`#ai-ready-virtual/page-data.mjs`**:
- Exports empty array (runtime uses static files)

## Content Signal Directives

The `contentSignal` option configures robots.txt directives for AI crawlers:

```typescript
contentSignal: {
  aiTrain: true,   // Allow AI model training
  search: true,    // Allow search indexing
  aiInput: true,   // Allow RAG/grounding
}
```

Generates robots.txt entries:
```
User-agent: *
Content-Usage: train-ai=y
Content-Signal: ai-train=yes, search=yes, ai-input=yes
```

## MCP Integration

Uses `@nuxtjs/mcp-toolkit` (optional dependency).

### Tool: list_pages

```typescript
name: 'list_pages'
inputSchema: {}
handler: returns page metadata as JSON
cache: '1h'
```

### Tool: search_pages

```typescript
name: 'search_pages'
inputSchema: { query: string, limit?: number }
handler: FTS5 full-text search via ai_ready_pages_fts (title/description/route/headings/keywords/markdown)
cache: '5m'
```

### Resource: pages

```typescript
uri: 'resource://nuxt-ai-ready/pages'
handler: returns page listing as JSON
cache: '1h'
```

## Type System

### ModuleOptions

```typescript
interface ModuleOptions {
  enabled?: boolean
  debug?: boolean
  mdreamOptions?: HTMLToMarkdownOptions & { preset?: 'minimal' }
  markdownCacheHeaders?: { maxAge?: number, swr?: boolean }
  llmsTxt?: LlmsTxtConfig
  contentSignal?: false | { aiTrain?: boolean, search?: boolean, aiInput?: boolean }
  mcp?: { tools?: boolean, resources?: boolean }
  cacheMaxAgeSeconds?: number
  ttl?: number // Re-index TTL in seconds (0 = never re-index)
  database?: {
    type?: 'sqlite' | 'd1' | 'libsql'
    filename?: string // SQLite file path
    bindingName?: string // D1 binding name
    url?: string // LibSQL URL
    authToken?: string // LibSQL auth token
  }
}
```

### BulkDocument (page-level)

```typescript
interface BulkDocument {
  route: string
  title: string
  description: string
  markdown: string
  headings: Array<Record<string, string>>
  keywords?: string[]
  updatedAt?: string
}
```

### PageEntry / PageData

```typescript
interface PageEntry {
  route: string
  title: string
  description: string
  headings: string // Pipe-delimited "h1:Title|h2:Subtitle"
  keywords: string[]
  updatedAt: string
}

interface PageData extends PageEntry {
  markdown: string
}
```

### MarkdownContext (runtime hook)

```typescript
interface MarkdownContext {
  html: string
  markdown: string // Modify this to change output
  route: string
  title: string
  description: string
  isPrerender: boolean
  event: H3Event
}
```

### PageIndexedContext (runtime hook)

```typescript
interface PageIndexedContext {
  route: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string[]
  updatedAt: string
}
```

## Error Handling

### Markdown Middleware

- Returns 404/500/415 if page fetch fails (when .md explicitly requested)
- Silently passes through if Accept header check fails

### llms.txt Generation

- Logs warning if sitemap not found/empty
- Returns empty pages section if sitemap unavailable

### Prerender

- Missing JSON fields default to empty strings/arrays
- Invalid updatedAt dates fall back to current time

## Dependencies

| Package | Purpose |
|---------|---------|
| mdream | HTML→markdown conversion |
| db0 | Universal database layer (SQLite, D1, LibSQL) |
| nuxt-site-config | Site metadata access |
| @nuxtjs/sitemap | Sitemap integration |
| @nuxtjs/mcp-toolkit | MCP server (optional) |
| @nuxtjs/robots | robots.txt directives |

## Rendering Mode Support

### SSG (Static Site Generation) - Full Support

Primary intended mode. All features work:
- Page data collected during `nuxi generate`
- `ai-ready:page:markdown` hook fires for each page
- llms.txt/llms-full.txt include page titles and content
- MCP resources return complete data

### Hybrid (Partial Prerender) - Partial Support

When mixing prerendered + SSR pages:
- Page data only contains prerendered pages
- llms.txt splits into "Prerendered Pages" vs "Other Pages" sections
- `ai-ready:page:markdown` hook only fires for prerendered pages
- Runtime markdown conversion works for all pages

**Limitation**: SSR pages appear without titles in llms.txt.

### SSR-Only - Limited Support

Without prerendering:
- No page data generated
- MCP resources return minimal data
- llms.txt works (from sitemap) but without page titles
- llms-full.txt shows placeholder message
- `ai-ready:page:markdown` hook never fires

**Use case**: Sites where runtime markdown conversion is sufficient.

### SPA - Not Supported

Module warns and provides minimal functionality:
- No server-side rendering means no HTML to convert
- MCP resources non-functional

**Workaround**: Enable `nitro.prerender.routes` for specific pages.

## Known Limitations

### Dev Mode

In development:
- Page data unavailable (returns empty Map)
- llms.txt shows notice about missing data
- Runtime markdown conversion still works

### Sitemap Dependency

llms.txt relies on `/sitemap.xml` for page list:
- If sitemap missing/broken, warnings logged
- Pages section will be empty
- Ensure `@nuxtjs/sitemap` is properly configured
