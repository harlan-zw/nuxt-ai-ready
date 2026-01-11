# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nuxt-ai-ready** is a Nuxt module that makes websites discoverable by AI agents and LLMs through standardized APIs and protocols.

Key features:
- **llms.txt generation**: Auto-generate `llms.txt` and `llms-full.txt` at build time
- **On-demand markdown**: Any route available as `.md` (e.g., `/about` → `/about.md`)
- **MCP server**: `list_pages`, `get_page`, and `search_pages` tools for AI agents
- **Content signals**: Configure AI training/search permissions via Nuxt Robots

## Development Commands

```bash
# Build & Development
pnpm build                    # Build module (stub → prepare → build)
pnpm dev                      # Start playground dev server
pnpm dev:prepare              # Build module + prepare playground

# Testing
pnpm test                     # Run all tests (unit + e2e) - runs prepare:fixtures first
pnpm test:unit                # Run unit tests only (no fixture prep)
pnpm test:e2e                 # Run e2e tests only (includes prepare:fixtures)

# Run single test file (unit tests also in src/**/*.test.ts)
pnpm vitest run test/unit/example.test.ts --project=unit
pnpm vitest run test/e2e/basic.test.ts --project=e2e

# Code Quality
pnpm lint                     # ESLint with auto-fix
pnpm typecheck                # TypeScript type checking (no emit)
```

## Architecture

### Build-time Flow (`src/prerender.ts`)

During prerender, the module:
1. Intercepts HTML output via middleware, converts to markdown using **mdream**
2. Writes page data to `.data/ai-ready/page-data.jsonl` (JSONL format)
3. On `prerender:done`, generates:
   - `llms.txt`: Site summary with LLM resource links
   - `llms-full.txt`: Full markdown content of all pages

### Runtime

- **Middleware** (`src/runtime/server/middleware/`): HTML→markdown conversion for `.md` requests
- **Routes**: `/llms.txt`, `/llms-full.txt` handlers (replaced with static files after prerender)
- **MCP** (`src/runtime/server/mcp/`): Tools and resources for AI agent integration
  - `tools/list-pages.ts`: List all pages with metadata (paginated)
  - `tools/get-page.ts`: Get single page with markdown content
  - `tools/search-pages.ts`: FTS5 full-text search
  - `resources/pages.ts`: Pages resource

### Database Layer (`src/runtime/server/db/`)

SQLite database via db0 for page storage and FTS5 search (tables prefixed `ai_ready_`):
- **schema.ts**: Table definitions (`ai_ready_pages`, `ai_ready_pages_fts`) with FTS5 triggers
- **index.ts**: Database singleton (`useDatabase()`)
- **queries.ts**: Unified query API (`queryPages`, `countPages`, `searchPages`, `upsertPage`)
- **dump.ts**: Compressed dump export/import for serverless cold starts

### Runtime Plugins (`src/runtime/server/plugins/`)

- **db-restore.ts**: Restores prerendered data from compressed dump on cold start
- **sitemap-seeder.ts**: Seeds routes from sitemap (only when `runtimeSync.enabled`)

### Runtime Architecture

**Default (prerender is source of truth):**
```
Build: prerender → crawl sitemap → create DB dump
Runtime: restore dump → llms.txt works immediately!
```

**Opt-in Runtime Sync (for dynamic content):**
```
Runtime: restore dump → sitemap seeder → index-now/cron → fresh data
```

Runtime sync is disabled by default. Enable it for sites with frequently changing content.

### Runtime Sync Endpoints (only when `runtimeSync.enabled`)

- `GET /__ai-ready/status` - Returns `{ total, indexed, pending }`
- `POST /__ai-ready/index-now` - Trigger indexing
  - `?secret=<token>` - Required if `runtimeSync.secret` configured
  - `?route=/path` - Force reindex single route (optional)
  - Returns: `{ indexed, remaining, errors, duration, complete }` or `{ success, title, isUpdate }`
- `POST /__ai-ready/prune` - Prune stale routes from database
  - `?dry=true` - Preview without deleting (no auth required)
  - `?ttl=<seconds>` - Override `pruneTtl` threshold

### Scheduled Task (`src/runtime/server/tasks/ai-ready-index.ts`)

Nitro scheduled task for automatic background indexing. Only registered when `runtimeSync.enabled` and `runtimeSync.cron` is set:

```ts
aiReady: {
  runtimeSync: {
    enabled: true,
    cron: '*/5 * * * *', // enables scheduled indexing every 5 min
    batchSize: 20
  }
}
```

### Utils
- **utils/indexPage.ts**: Manual indexing utilities (`indexPage`, `indexPageByRoute`)
- **utils/batchIndex.ts**: Shared batch indexing logic for index-now and scheduled task
- **utils/pageData.ts**: Unified read from database
- **utils/sitemap.ts**: Fetch and parse sitemap URLs

### Key Dependencies

- **mdream**: HTML → markdown conversion
- **db0**: Universal database layer (SQLite, D1, LibSQL)
- **@nuxtjs/mcp-toolkit**: MCP server (optional, enables MCP features)
- **nuxt-site-config**: Site metadata (peer dependency)
- **@nuxtjs/robots**, **@nuxtjs/sitemap**: Required module dependencies

### Module Hooks

```ts
// Nuxt hooks (build-time)
'ai-ready:llms-txt': (payload) => void    // Extend llms.txt content
'ai-ready:page:markdown': (context) => void // Process page markdown during prerender

// Nitro hooks (runtime)
'ai-ready:markdown': (context) => void     // Modify markdown output
'ai-ready:mdreamConfig': (config) => void  // Customize mdream options
'ai-ready:page:indexed': (context) => void // Called when page indexed at runtime
```

### Type Exports

- `ModuleOptions`: Module configuration interface
- `BulkDocument`: Page-level data (route, title, description, markdown, headings, updatedAt)
- `PageEntry`: Page metadata without markdown (route, title, description, headings, updatedAt)
- `PageData`: PageEntry + markdown content
- `MarkdownContext`: Hook context for markdown processing
- `PageIndexedContext`: Hook context for runtime page indexing
- `LlmsTxtConfig`, `LlmsTxtSection`, `LlmsTxtLink`: llms.txt structure

## Module Configuration

Config key: `aiReady` in nuxt.config.ts

```ts
{
  enabled: true,
  debug: false,
  mdreamOptions: { preset: 'minimal' },
  markdownCacheHeaders: { maxAge: 3600, swr: true },
  cacheMaxAgeSeconds: 600,
  llmsTxt: { sections: [], notes: [] },
  contentSignal: { aiTrain: boolean, search: boolean, aiInput: boolean },
  mcp: { tools: true, resources: true },
  database: { type: 'sqlite', filename: '.data/ai-ready/pages.db' },
  // Opt-in runtime sync for dynamic content sites
  runtimeSync: {
    enabled: false, // default OFF - prerendered data is used
    ttl: 3600, // refresh TTL for sitemap + page re-indexing (seconds)
    batchSize: 20, // pages per sync batch
    cron: '*/5 * * * *', // enables scheduled sync (optional)
    secret: '', // auth for index-now endpoint
    pruneTtl: 0, // prune stale routes TTL (0 = never, 604800 = 7 days)
  },
}
```

## Important Notes

- Requires Nuxt ≥4.0.0
- Uses `#ai-ready` alias for runtime imports
- MCP paths registered via `mcp:definitions:paths` hook (from @nuxtjs/mcp-toolkit)
- Prerendering required for `llms-full.txt` generation (`nuxi generate` or `nuxi build --prerender`)
- SPA mode without prerendering has limited functionality
