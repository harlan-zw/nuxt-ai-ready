# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nuxt-ai-ready** is a Nuxt module that makes websites discoverable by AI agents and LLMs through standardized APIs and protocols.

Key features:
- **llms.txt generation**: Auto-generate `llms.txt` and `llms-full.txt` at build time
- **On-demand markdown**: Any route available as `.md` (e.g., `/about` → `/about.md`)
- **MCP server**: `list_pages` and `search_pages_fuzzy` tools for AI agents
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

# Run single test file
pnpm vitest run path/to/test.ts --project=unit
pnpm vitest run path/to/test.ts --project=e2e

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
  - `tools/list-pages.ts`: List all pages with metadata
  - `tools/search-pages-fuzzy.ts`: Fuzzy search using Fuse.js
  - `resources/pages.ts`: Pages resource

### Key Dependencies

- **mdream**: HTML → markdown conversion
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
```

### Type Exports

- `ModuleOptions`: Module configuration interface
- `BulkDocument`: Page-level data (route, title, description, markdown, headings)
- `MarkdownContext`: Hook context for markdown processing
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
}
```

## Important Notes

- Requires Nuxt ≥4.0.0
- Uses `#ai-ready` alias for runtime imports
- MCP paths registered via `mcp:definitions:paths` hook (from @nuxtjs/mcp-toolkit)
- Prerendering required for `llms-full.txt` generation (`nuxi generate` or `nuxi build --prerender`)
- SPA mode without prerendering has limited functionality
