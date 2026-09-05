# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nuxt-ai-ready** is a Nuxt module that makes websites discoverable by AI agents and LLMs through standardized APIs and protocols.

Key features:
- **llms.txt generation**: Auto-generate `llms.txt` and `llms-full.txt` at build time
- **On-demand markdown**: Any route available as `.md` (e.g., `/about` → `/about.md`), plus `Accept: text/markdown` negotiation
- **Nuxt Content integration**: Pages backed by a page collection serve source markdown directly (`contentSource`)
- **MCP server**: `list_pages`, `search_pages`, `get_page_markdown` tools for AI agents, plus an MCP server card and AI catalog
- **API catalog**: RFC 9727 linkset at `/.well-known/api-catalog`
- **Agent skills**: v0.2.0 discovery index at `/.well-known/agent-skills/index.json`
- **WebMCP**: Browser-side tools for in-page AI agents via `document.modelContext`
- **Runtime indexing**: Seed and index pages on-demand from the sitemap, with SQLite, D1, LibSQL, Neon and Postgres storage
- **i18n**: Auto-detects `@nuxtjs/i18n` for hreflang Link headers, locale frontmatter and llms.txt sections
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

- **Middleware** (`src/runtime/server/middleware/`): HTML→markdown conversion for `.md` requests (dev/runtime + prerender variants)
- **Routes**: `/llms.txt`, `/llms-full.txt` (replaced with static files after prerender); discovery routes `/.well-known/api-catalog`, `/.well-known/ai-catalog.json`, `/.well-known/agent-skills/index.json`, MCP server card; `/__ai-ready/*` control endpoints
- **MCP** (`src/runtime/server/mcp/`): Tools and resources for AI agent integration
  - `tools/list-pages.ts`, `tools/search-pages.ts`, `tools/get-page-markdown.ts`
  - `resources/pages.ts`: Pages resource
- **WebMCP** (`src/runtime/webmcp.ts`, `webmcp-site-tools.ts`): `document.modelContext` types plus the built-in `list_pages`, `search_pages` and `get_page_markdown` browser tools (opt-in via `webmcp`). Registered by `app/plugins/webmcp.client.ts`, backed by `GET /__ai-ready/pages`. `useWebMcpTool()` (`app/composables/webmcp.ts`) is auto-imported when `webmcp` is enabled.
- **Devtools**: dev-only UI at `/__nuxt-ai-ready`, backed by `GET /__ai-ready__/devtools` (registered in dev or debug mode only)
- **CLI**: `nuxt-ai-ready status|poll|restore|prune` (`src/cli.ts`)

### Database Layer (`src/runtime/server/db/`)

Page storage and FTS5 search via drizzle-orm, tables prefixed `ai_ready_`:
- **schema/**: SQLite and Postgres table definitions; **schema-sql.ts**: raw SQL + FTS5 triggers
- **drizzle/providers/**: sqlite (better-sqlite3), bun, node-sqlite, d1, libsql, neon, postgres clients
- **queries.ts** (raw SQL adapters) and **drizzle/queries.ts**: two parallel query layers, keep both in sync
- **shared.ts**: shared row mapping; dump export/import for serverless cold starts lives in `utils/checkStale.ts`

### Runtime Plugins (`src/runtime/server/plugins/`)

- **db-lifecycle.ts**: DB lifecycle management
- **sitemap-seeder.ts**: Seeds routes from sitemap into DB on first request (with TTL)
- **markdown-negotiation.ts**: Splices the Accept negotiation handler into the h3 stack ahead of Nitro's static asset handler, which otherwise answers prerendered routes before any middleware
- **link-header.ts**: Status-aware Link headers (alternate markdown, hreflang, api-catalog)
- **html-capture.prerender.ts**: Captures HTML during prerender
- **mcp-data.ts**: Feeds page data to the MCP server

### Runtime Indexing Flow

Indexing uses explicit polling triggers (no waitUntil piggybacking):

```
sitemap-seeder → seeds routes on first request (once per TTL)
poll endpoint  → indexes pages on-demand via external cron/CI
scheduled task → auto-indexes via Nitro cron (Cloudflare/native)
```

This ensures only public pages (those in sitemap) are indexed, avoiding auth-gated content.

### Indexing Control Endpoints (when `runtimeSync: true`)

- `GET /__ai-ready/status` - Returns `{ total, indexed, pending }`
- `POST /__ai-ready/restore` - Force restore from prerendered dump:
  - `?clear=false` - Don't clear existing pages first (default: true)
  - Requires `Authorization: Bearer <token>` header if `runtimeSyncSecret` configured
  - Returns: `{ restored, cleared }`
- `POST /__ai-ready/poll` - Process pending pages:
  - `?limit=N` - Max pages per batch (default: 10, max: 50)
  - `?all=true` - Process until complete
  - `?timeout=30000` - Max ms for `all` mode (default: 30s)
  - Requires `Authorization: Bearer <token>` header if `runtimeSyncSecret` configured
  - Returns: `{ indexed, remaining, errors, duration, complete }`
- `POST /__ai-ready/prune` - Remove stale routes:
  - `?dry=true` - Preview without deleting
  - `?ttl=N` - Override pruneTtl config
  - Requires `Authorization: Bearer <token>` header unless dry run

### Scheduled Task (`src/runtime/server/tasks/ai-ready-cron.ts`)

Cron task runs every 5 minutes when enabled (`*/5 * * * *`). `cron: true` auto-enables `runtimeSync`.

```ts
aiReady: {
  cron: true, // every 5 minutes, auto-enables runtimeSync
}
```

**Platform support:**
- **Cloudflare/Native**: Uses Nitro's `scheduledTasks` API
- **Vercel**: Auto-configures `vercel.json` crons to call `GET /__ai-ready/cron`
- **Other**: Use external cron to call `GET /__ai-ready/cron`

### Utils
- **utils/indexPage.ts**: Manual indexing utilities (`indexPage`, `indexPageByRoute`)
- **utils/batchIndex.ts**: Shared batch indexing logic for poll endpoint and scheduled task
- **utils/runCron.ts**, **cron-plan.ts**: Scheduled task execution and planning
- **utils/checkStale.ts**: Build-id + hash comparison, restores prerendered dump on cold start
- **utils/sitemap.ts**, **sitemap-routes.ts**, **sitemap-crawl-state.ts**: Sitemap fetch, parse and crawl state
- **utils/negotiation-decision.ts**, **negotiation-response.ts**, **content-negotiation.ts**: Accept header negotiation
- **utils/link-header.ts**: Link header building

### Key Dependencies

- **mdream**, **@mdream/js**: HTML → markdown conversion and negotiation
- **drizzle-orm**: Database layer (SQLite, D1, LibSQL, Neon, Postgres)
- **@nuxtjs/mcp-toolkit**: MCP server (optional, enables MCP features)
- **nuxt-site-config**: Site metadata
- **@nuxtjs/robots**, **@nuxtjs/sitemap**: Required module dependencies

### Module Hooks

```ts
// Nuxt hooks (build-time)
'ai-ready:llms-txt': (payload) => void         // Extend llms.txt content
'ai-ready:page:markdown': (context) => void    // Process page markdown during prerender

// Nitro hooks (runtime)
'ai-ready:markdown:source': (context) => void  // Short-circuit with a custom markdown source
'ai-ready:page:markdown': (context) => void    // Modify markdown output
'ai-ready:page:indexed': (context) => void     // Called when page indexed at runtime

// App hooks
'ai-ready:webmcp:tools': (tools) => void       // Add browser tools
```

### Type Exports

- `ModuleOptions`: Module configuration interface
- `PageDocument`: Page-level data (route, title, description, markdown, headings, updatedAt)
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
  mdreamOptions: { minimal: true },
  markdownCacheHeaders: { maxAge: 3600, swr: true },
  llmsTxtCacheSeconds: 600,
  llmsTxt: { sections: [], notes: [] },
  contentSignal: { aiTrain: boolean, search: boolean, aiInput: boolean },
  mcp: { tools: true, resources: true },
  webmcp: true, // browser tools via document.modelContext
  database: { type: 'sqlite', filename: '.data/ai-ready/pages.db' },
  cron: true, // every 5 minutes, auto-enables runtimeSync
  runtimeSyncSecret: 'token', // auth for runtime sync endpoints
  runtimeSync: { ttl: 3600, batchSize: 50, pruneTtl: 0 }, // optional overrides
}
```

## Important Notes

- Requires Nuxt ≥4.0.0
- Uses `#ai-ready` alias for runtime imports
- Enables `nitro.experimental.asyncContext` automatically (allows `useEvent()` in nested functions)
- MCP paths registered via `mcp:definitions:paths` hook (from @nuxtjs/mcp-toolkit)
- Prerendering required for `llms-full.txt` generation (`nuxi generate` or `nuxi build --prerender`)
- SPA mode without prerendering has limited functionality

<!-- skilld -->
Before modifying code, evaluate each installed skill against the current task.
For each skill, determine YES/NO relevance and invoke all YES skills before proceeding.
<!-- /skilld -->
