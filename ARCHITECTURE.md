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
   ├─► Write to SQLite database
   ├─► Stream-append to llms-full.txt
   └─► Replace route.contents with raw markdown

4. prerender:done or sitemap:prerender:done:
   └─► Prerender /llms.txt via route handler (reads from database)

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
• Routes seeded from sitemap on first request (sitemap-seeder plugin)
• Pages indexed via poll endpoint or scheduled task (batchIndex utility)
• Internal fetch ensures only public content indexed (no auth cookies)
• FTS5 full-text search for MCP tools (`ai_ready_pages_fts`)
• Compressed dump for serverless cold start restore

Indexing Control Endpoints:
• GET /__ai-ready/status     - { total, indexed, pending }
• POST /__ai-ready/poll      - Process batch of pages
• POST /__ai-ready/prune     - Remove stale routes
```

## Directory Structure

```
src/
├── module.ts                 # Nuxt module entry - hooks, config, handlers
├── prerender.ts              # Build-time llms.txt/llms-full.txt generation
├── kit.ts                    # License verification, preset detection
├── logger.ts                 # Build-time logger (@nuxt/kit)
├── types.ts                  # Re-exports runtime types
└── utils/
    ├── database.ts           # Build-time database utilities
    └── prerender-db.ts       # Prerender database adapter

└── runtime/
    ├── types.ts              # Public types (ModuleOptions, BulkDocument, etc)
    ├── llms-txt-utils.ts     # buildLlmsTxt, page sorting/grouping
    ├── llms-txt-format.ts    # normalizeLlmsTxtConfig (pure formatting)
    ├── index.ts              # Runtime entry - exports database, queries, indexing utils

    ├── nuxt/plugins/
    │   └── md-hints.prerender.ts  # Queues .md routes during app:rendered

    └── server/
        ├── middleware/
        │   ├── markdown.prerender.ts  # Prerender: HTML→JSON (markdown+meta)
        │   └── markdown.ts            # Runtime: HTML→markdown with hooks
        │
        ├── routes/
        │   ├── llms.txt.get.ts        # Route handler calling buildLlmsTxt
        │   ├── llms-full.txt.get.ts   # Streams pages from DB at runtime
        │   ├── __ai-ready-debug.get.ts # Debug endpoint
        │   └── __ai-ready/
        │       ├── status.get.ts      # GET indexing status
        │       ├── poll.post.ts       # POST bulk indexing trigger
        │       └── prune.post.ts      # POST prune stale routes
        │
        ├── db/
        │   ├── index.ts       # useDatabase() singleton
        │   ├── schema-sql.ts  # SQL table definitions, version constant
        │   ├── shared.ts      # DatabaseAdapter, initSchema, insertPage, computeContentHash, exportDbDump, importDbDump
        │   └── queries.ts     # queryPages, searchPages, countPages, streamPages, upsertPage
        │
        ├── plugins/
        │   ├── db-restore.ts      # Restore dump on cold start
        │   └── sitemap-seeder.ts  # Seed routes from sitemap (with TTL)
        │
        ├── tasks/
        │   └── ai-ready-index.ts  # Nitro scheduled task for background indexing
        │
        ├── utils/
        │   ├── indexPage.ts   # Manual indexing utilities
        │   ├── batchIndex.ts  # Shared batch indexing logic
        │   ├── sitemap.ts     # fetchSitemapUrls - parse /sitemap.xml
        │   ├── keywords.ts    # extractKeywords
        │   └── llms-full.ts   # formatPageForLlmsFullTxt, buildLlmsFullTxtHeader
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
   └─► Initializes SQLite database and llms-full.txt stream

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
   ├─► Write page to SQLite database
   ├─► Stream-append to llms-full.txt
   └─► Replace contents with raw markdown

5. prerender:done OR sitemap:prerender:done
   ├─► Crawl sitemap for SSR pages not prerendered
   ├─► Export database dump for serverless restore
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

## Runtime Indexing Architecture

The module uses a sitemap-driven approach to index pages at runtime, ensuring only public pages are indexed. Runtime sync is opt-in via `runtimeSync.enabled`.

### Sitemap Seeder Plugin (`sitemap-seeder.ts`)

On first request (once per TTL):
1. Checks if sitemap was recently seeded (TTL from `runtimeSync.ttl` config, default 1 hour)
2. If stale/missing, fetches `/sitemap.xml` and parses URLs
3. Seeds routes into database with `indexed=0` (route known, content pending)
4. Updates `last_seen_at` for existing routes (for stale detection)
5. Stores seed timestamp for TTL tracking

### Indexing Flow

Pages are indexed via explicit triggers (poll endpoint or scheduled task):
1. Poll endpoint or scheduled task calls `batchIndexPages()`
2. Gets unindexed routes from database (`indexed=0`)
3. Fetches each page internally with `x-ai-ready-indexing` header (no user cookies)
4. Converts HTML to markdown, extracts metadata
5. Upserts page with `indexed=1` and `source='runtime'`
6. Calls `ai-ready:page:indexed` hook

### Security Model

The internal fetch approach ensures:
- Only pages in sitemap are indexed (sitemap = public pages)
- Fetch happens server-side without user's auth cookies
- Auth-gated content never gets indexed
- No risk of exposing private content via search/MCP

### Indexing Control Endpoints

```bash
# Check progress
GET /__ai-ready/status
# Returns: { total: 50, indexed: 45, pending: 5 }

# Process batch (bulk indexing)
POST /__ai-ready/poll?limit=20
# Returns: { indexed: 20, remaining: 25, errors: [], duration: 1234, complete: false }

# Prune stale routes (dry run)
POST /__ai-ready/prune?dry=true
# Returns: { routes: ["/old-page"], count: 1, ttl: 86400, dry: true }

# Prune stale routes (execute)
POST /__ai-ready/prune?secret=<token>
# Returns: { pruned: 1, ttl: 86400, dry: false }
```

### Database Schema (v1.5.0)

```sql
CREATE TABLE ai_ready_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT UNIQUE NOT NULL,
  route_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL DEFAULT '',
  headings TEXT NOT NULL DEFAULT '[]',
  keywords TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT,              -- SHA-256 hash (16 chars) for change detection
  updated_at TEXT NOT NULL,
  indexed_at INTEGER NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  indexed INTEGER NOT NULL DEFAULT 0,  -- 0=seeded, 1=fully indexed
  source TEXT NOT NULL DEFAULT 'prerender',  -- 'prerender' or 'runtime'
  last_seen_at INTEGER  -- for stale route detection
);

CREATE TABLE _ai_ready_info (
  id TEXT PRIMARY KEY,
  value TEXT,
  version TEXT,
  checksum TEXT,
  ready INTEGER DEFAULT 0
);
```

### Content Hash for Change Detection

Pages store a `content_hash` (first 16 chars of SHA-256 of markdown) to detect actual content changes:

```typescript
// Check if content changed
import { getPageHash } from './db/queries'

// Compute hash
import { computeContentHash } from './db/shared'
// "a1b2c3d4e5f6g7h8"
const hash = await computeContentHash(markdown)
const existingHash = await getPageHash(event, route)
const contentChanged = existingHash !== newHash
```

This enables:
- **IndexNow integration**: Only notify search engines when content actually changes
- **Skip unchanged pages**: Avoid unnecessary processing during re-indexing
- **TTL revalidation**: Re-fetch page, compare hash, skip upsert if unchanged

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

**`src/runtime/llms-txt-format.ts`** - Pure formatting functions:
- `normalizeLlmsTxtConfig()`: Converts `LlmsTxtConfig` to markdown string

**`src/runtime/llms-txt-utils.ts`** - Core build functions:
- `buildLlmsTxt()`: Assembles full llms.txt from site config + pages + sitemap
- `sortPagesByPath()`: Hierarchical sorting by URL path
- `formatPagesWithGroups()`: Format pages with group separators

**`src/runtime/server/db/shared.ts`** - Shared database utilities (build + runtime):
- `DatabaseAdapter`: Interface for db0 connector abstraction
- `createAdapter()`: Create adapter from db0 Connector
- `initSchema()`: Initialize schema with version checking
- `computeContentHash()`: SHA-256 hash (16 chars) for change detection
- `normalizeRouteKey()`: Convert route to storage key format
- `insertPage()`, `queryAllPages()`: Core page operations
- `exportDbDump()`, `importDbDump()`: Compressed dump operations
- `compressToBase64()`, `decompressFromBase64()`: Gzip compression utils

**`src/runtime/server/utils/llms-full.ts`** - llms-full.txt formatting:
- `stripFrontmatter()`: Remove YAML frontmatter from markdown
- `normalizeHeadings()`: Convert `#` headings to `h1.` style for LLM readability
- `formatPageForLlmsFullTxt()`: Format single page entry
- `buildLlmsFullTxtHeader()`: Generate file header with site info

**`src/runtime/server/db/queries.ts`** - Unified query interface:
- `queryPages(event?, options)`: Query pages with filters, pagination
- `searchPages(event, query, options)`: FTS5 full-text search
- `countPages(event?, options)`: Count pages matching criteria
- `streamPages(event?, options)`: Stream pages for large datasets

### Query Functions

All query functions follow event-first pattern with optional db override:

```typescript
// Basic query - all pages
const pages = await queryPages(event)

// Single page lookup
const page = await queryPages(event, { route: '/about' })

// With markdown content
const page = await queryPages(event, { route: '/about', includeMarkdown: true })

// Filter by status
const pending = await queryPages(event, { where: { pending: true } })

// Pagination
const batch = await queryPages(event, { limit: 10, offset: 20 })

// Full-text search (runtime only)
const results = await searchPages(event, 'nuxt config', { limit: 10 })

// Count pages
const total = await countPages(event)
const pending = await countPages(event, { where: { pending: true } })

// Stream for large datasets
for await (const page of streamPages(event, { batchSize: 50 })) {
  // process page
}

// With explicit db (when already have db instance)
const pages = await queryPages(event, { db, limit: 10 })
```

### Environment Behavior

```typescript
// Dev: returns empty array with console warning
if (import.meta.dev)
  return []

// Prerender: reads from build-time SQLite via virtual module adapter
if (import.meta.prerender)
  return getPrerenderDb()

// Production: reads from database via db0
return useDatabase(event)
```

### llms.txt.get.ts

Runtime route handler that builds llms.txt:

1. Header: site name, description, canonical URL
2. Sections from `llmsTxtConfig` (LLM Resources, MCP, etc)
3. Adds sitemap and robots.txt links to LLM Resources section
4. Pages section:
   - Gets pages from `queryPages()` (with titles)
   - Gets sitemap URLs for SSR pages
   - Splits into "Prerendered Pages" vs "Other Pages" if mixed

### llms-full.txt.get.ts

At runtime, streams pages from database using `streamPages()` and formats via `formatPageForLlmsFullTxt()`. During prerender, returns placeholder (static file generated directly to public dir).

### Virtual Modules

**`#ai-ready-virtual/read-page-data.mjs`**:
- Reads from build-time SQLite during prerender
- Returns pages array for prerender adapter

**`#ai-ready-virtual/page-data.mjs`**:
- Exports empty arrays (runtime uses database)

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
  database?: {
    type?: 'sqlite' | 'd1' | 'libsql'
    filename?: string
    bindingName?: string
    url?: string
    authToken?: string
  }
  runtimeSync?: {
    enabled?: boolean
    ttl?: number
    batchSize?: number
    cron?: string
    secret?: string
    pruneTtl?: number
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
  isUpdate: boolean // true if updating existing page
}
```

### IndexPageResult (indexPage utility)

```typescript
interface IndexPageResult {
  success: boolean
  skipped?: boolean // true if page was fresh and skipped
  isUpdate?: boolean // true if updating existing page
  contentChanged?: boolean // true if content hash differs from previous
  data?: {
    route: string
    title: string
    description: string
    headings: string
    keywords: string[]
    markdown: string
    contentHash: string // 16-char SHA-256 hash
    updatedAt: string
  }
  error?: string
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
| uncrypto | Cross-platform Web Crypto API for content hashing |
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

## Deployment Guides

### Node.js / Self-Hosted (Default)

Default SQLite storage, works out of the box:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  aiReady: {
    database: {
      type: 'sqlite',
      filename: '.data/ai-ready/pages.db', // default
    },
  },
})
```

Build and run:
```bash
nuxi generate  # or nuxi build --prerender
node .output/server/index.mjs
```

SQLite file persists between restarts. For ephemeral environments (Docker, serverless), use dump restore (see below).

### Cloudflare Workers + D1

Requires D1 database binding and `cloudflare-pages` or `cloudflare-module` preset.

1. Create D1 database:
```bash
wrangler d1 create ai-ready-db
```

2. Configure wrangler.toml:
```toml
[[d1_databases]]
binding = "AI_READY_DB"
database_name = "ai-ready-db"
database_id = "<your-database-id>"
```

3. Configure nuxt.config.ts:
```ts
export default defineNuxtConfig({
  nitro: {
    preset: 'cloudflare-pages', // or 'cloudflare-module'
  },
  aiReady: {
    database: {
      type: 'd1',
      bindingName: 'AI_READY_DB',
    },
  },
})
```

4. Build and deploy:
```bash
nuxi generate
wrangler pages deploy dist  # or wrangler deploy for module preset
```

**Cold start behavior**: On first request, `db-restore` plugin fetches `/__ai-ready/pages.dump` and imports prerendered data into D1.

### Netlify

Uses SQLite with automatic `_headers` generation for markdown Content-Type:

```ts
export default defineNuxtConfig({
  nitro: {
    preset: 'netlify',
  },
  // SQLite default works - persisted in Netlify Functions storage
})
```

Build outputs `dist/_headers` with:
```
/*.md
  Content-Type: text/markdown; charset=utf-8
/llms.txt
  Content-Type: text/plain; charset=utf-8
```

### Vercel

Uses SQLite with serverless function storage:

```ts
export default defineNuxtConfig({
  nitro: {
    preset: 'vercel',
  },
  aiReady: {
    database: {
      type: 'sqlite',
      filename: '/tmp/ai-ready/pages.db', // Vercel tmp storage
    },
  },
})
```

**Note**: `/tmp` is ephemeral per function instance. Cold starts restore from dump automatically.

### Turso (LibSQL)

For persistent edge database across all platforms:

```ts
export default defineNuxtConfig({
  aiReady: {
    database: {
      type: 'libsql',
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    },
  },
})
```

### Dump Restore Flow (Serverless)

For ephemeral storage (D1, Vercel, Docker):

1. **Build time**: `prerender:done` exports `/__ai-ready/pages.dump` (gzip base64)
2. **Cold start**: `db-restore` plugin checks if DB empty
3. **If empty**: Fetches dump, decompresses, imports all rows
4. **Result**: Full page data available without re-indexing

This ensures MCP tools and llms.txt work immediately on first request.

## Database Migrations

### Schema Versioning

Schema version tracked in `_ai_ready_info` table:

```sql
SELECT version FROM _ai_ready_info WHERE id = 'schema'
-- Returns: 'v1.5.0'
```

Current version: `v1.5.0` (defined in `src/runtime/server/db/schema-sql.ts`)

### Migration Strategy

The module uses **drop-and-recreate** strategy for schema changes:

```typescript
// src/runtime/server/db/shared.ts
async function initSchema(db: DatabaseAdapter): Promise<void> {
  const needsRebuild = await checkSchemaVersion(db)

  if (needsRebuild) {
    // Drop all tables (including legacy unprefixed tables)
    for (const sql of DROP_TABLES_SQL) {
      await db.exec(sql)
    }
  }

  // Create all tables fresh
  for (const sql of ALL_SCHEMA_SQL) {
    await db.exec(sql)
  }

  // Store current version
  await db.exec(
    'INSERT OR REPLACE INTO _ai_ready_info (id, version) VALUES (?, ?)',
    ['schema', SCHEMA_VERSION]
  )
}
```

### When Migrations Run

1. **Build time**: Schema initialized when prerender writes first page
2. **Runtime cold start**: Schema checked on `useDatabase()` first call
3. **Version mismatch**: All tables dropped, recreated with new schema

### Data Preservation

Since migrations drop tables, data is preserved via:

1. **Prerendered sites**: Data re-generated each build (pages.dump)
2. **Runtime indexing**: Re-seeds from sitemap, re-indexes pages
3. **Upgrade path**: Run `nuxi generate` after module upgrade to rebuild

### Version History

| Version | Changes |
|---------|---------|
| v1.5.0 | Added `content_hash`, `last_seen_at`, `source` columns |
| v1.4.0 | Added `indexed` column for runtime indexing status |
| v1.3.0 | Added `route_key` column, prefixed tables with `ai_ready_` |
| v1.2.0 | Added FTS5 triggers for automatic index sync |
| v1.1.0 | Added `keywords` column |
| v1.0.0 | Initial schema (unprefixed `pages` table) |

### Legacy Table Migration

v1.3.0 renamed tables from `pages`/`pages_fts` to `ai_ready_pages`/`ai_ready_pages_fts`. Old tables are dropped automatically:

```typescript
// DROP_TABLES_SQL includes:
'DROP TABLE IF EXISTS pages_fts',  // Legacy
'DROP TABLE IF EXISTS pages',       // Legacy
```

### Manual Schema Reset

Force schema rebuild by deleting info row:

```sql
DELETE FROM _ai_ready_info WHERE id = 'schema';
```

Next request will drop and recreate all tables.

## Known Limitations

### Dev Mode

In development:
- Page data unavailable (returns empty array with console warning)
- llms.txt shows notice about missing data
- Runtime markdown conversion still works

### Sitemap Dependency

llms.txt relies on `/sitemap.xml` for page list:
- If sitemap missing/broken, warnings logged
- Pages section will be empty
- Ensure `@nuxtjs/sitemap` is properly configured
