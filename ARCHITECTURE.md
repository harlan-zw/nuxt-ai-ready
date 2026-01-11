# Architecture

nuxt-ai-ready makes websites discoverable by AI agents through llms.txt, MCP tools, and markdown conversion.

## Data Flow

```
BUILD TIME (Prerender)
──────────────────────────────────────────────────────────────────────────

1. Nuxt plugin queues .md routes for each rendered page
   └─► /about/ → /about/index.md

2. markdown.prerender middleware intercepts .md requests:
   └─► Fetch HTML → convert to markdown + metadata → return JSON

3. prerender:generate hook processes each .md file:
   ├─► Parse JSON, call ai-ready:page:markdown hook
   ├─► Append to page-data.jsonl
   ├─► Stream-append to llms-full.txt
   └─► Replace route.contents with raw markdown

4. prerender:done or sitemap:prerender:done:
   └─► Prerender /llms.txt via route handler

RUNTIME
──────────────────────────────────────────────────────────────────────────

Static files: /llms.txt, /llms-full.txt

markdown.ts middleware: Live HTML→markdown for .md requests

MCP Server: list_pages, get_page, search_pages tools

Database (SQLite/D1/LibSQL):
• Routes seeded from sitemap (sitemap-seeder plugin)
• Pages indexed via index-now endpoint or cron task
• FTS5 full-text search for MCP tools
```

## Directory Structure

```
src/
├── module.ts                 # Nuxt module entry
├── prerender.ts              # Build-time llms.txt/llms-full.txt generation
└── runtime/
    ├── types.ts              # Public types
    ├── llms-txt-utils.ts     # buildLlmsTxt, normalizeLlmsTxtConfig
    ├── nuxt/plugins/
    │   └── md-hints.prerender.ts  # Queues .md routes during prerender
    └── server/
        ├── middleware/
        │   ├── markdown.prerender.ts  # Prerender: HTML→JSON
        │   └── markdown.ts            # Runtime: HTML→markdown
        ├── routes/
        │   ├── llms.txt.get.ts
        │   ├── llms-full.txt.get.ts
        │   └── __ai-ready/            # status, index-now, prune
        ├── db/
        │   ├── index.ts       # useDatabase() singleton
        │   ├── schema.ts      # ai_ready_pages, ai_ready_pages_fts
        │   ├── queries.ts     # queryPages, countPages, searchPages, upsertPage
        │   └── dump.ts        # Compressed dump for serverless
        ├── plugins/
        │   ├── db-restore.ts      # Restore dump on cold start
        │   └── sitemap-seeder.ts  # Seed routes from sitemap
        ├── tasks/
        │   └── ai-ready-index.ts  # Scheduled background indexing
        ├── utils/
        │   ├── pageData.ts    # getPages/getPagesList
        │   ├── indexPage.ts   # Manual indexing
        │   ├── batchIndex.ts  # Shared batch logic
        │   └── sitemap.ts     # fetchSitemapUrls
        └── mcp/
            ├── tools/         # list-pages, get-page, search-pages
            └── resources/     # pages resource
```

## Key Design Decisions

**Sitemap-driven**: Sitemap = canonical public pages. No manual config, no auth-gated leaks.

**Streaming llms-full.txt**: Large sites can have 100MB+ markdown. Stream-append during prerender avoids memory issues.

**Compressed dumps**: Serverless has no persistent filesystem. Prerender creates dump, `db-restore.ts` restores on cold start.

**Internal fetch for indexing**: `batchIndex.ts` fetches without cookies via `x-ai-ready-indexing` header. Only public content indexed.

**Source tracking**: `source` column (`'prerender'`/`'runtime'`) for debugging and selective pruning.

## Hooks

```typescript
// Build-time (Nuxt)
'ai-ready:page:markdown' // Modify page during prerender
'ai-ready:llms-txt' // Extend llms.txt sections

// Runtime (Nitro)
'ai-ready:markdown' // Modify markdown output
'ai-ready:mdreamConfig' // Customize mdream per-request
'ai-ready:page:indexed' // Called after runtime indexing
```

## Limitations

- **Dev mode**: No page data, llms.txt shows notice
- **SPA**: No SSR = no HTML to convert, module warns
- **Sitemap required**: llms.txt relies on /sitemap.xml for page list
