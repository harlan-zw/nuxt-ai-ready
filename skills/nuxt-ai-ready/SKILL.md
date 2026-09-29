---
name: nuxt-ai-ready
description: Add, configure, or debug AI and LLM discoverability in a Nuxt site with the nuxt-ai-ready module. Use when a task mentions llms.txt, llms-full.txt, serving pages as Markdown (.md routes, Accept text/markdown), an MCP server for site content, WebMCP or useWebMcpTool, Content Signals in robots.txt, agent skills discovery, runtime page indexing, queryPages or searchPages, or the aiReady config key. Gives the automatic outputs, the build versus runtime split, and the traps that leave output empty or stale.
---

# nuxt-ai-ready

Tested against `nuxt-ai-ready` 2.4.1 on Nuxt 4.5 and Node 24 (requires Nuxt `>=4.0.0`).
The module converts rendered pages to Markdown with mdream and publishes `llms.txt`, `llms-full.txt`, and `.md` twins.
Optional parts add MCP tools, WebMCP tools, and a runtime page index. Config key: `aiReady`. Docs: https://nuxtseo.com/ai-ready

## Setup

The module loads `@nuxtjs/robots` and `@nuxtjs/sitemap` as module dependencies, but the package does not install them.
If the build fails with `Could not resolve @nuxtjs/robots`, install both:

```bash
pnpm add nuxt-ai-ready @nuxtjs/robots @nuxtjs/sitemap
```

Set `site.url`. Canonical URLs, `Link` headers, and `/.well-known/ai-catalog.json` use it.
Prerender the pages you want in `llms-full.txt` and in the page index (`nuxi generate`, or `nitro.prerender.routes`).
A page visit in dev or production does not index anything.

## Automatic behaviour

With no `aiReady` config, the module adds:

- `/llms.txt`: site name, description, resource links, and a `## Pages` list. In dev it lists sitemap routes without titles.
- `/llms-full.txt`: the full Markdown of each prerendered page. Only prerendered pages go in the static file.
- A `.md` twin per page. `/about` becomes `/about.md`, and `/` becomes `/index.md`. Paths under `/api` and `/_` get none.
- Accept negotiation: a request that prefers `text/markdown`, or a known AI bot user agent, gets a `307` to the `.md` URL.
- `<link rel="alternate" type="text/markdown">` and `<link rel="describedby" href="/llms.txt">` in HTML, plus matching `Link` headers.
- `/sitemap.md`, and a `## Sitemap` footer on every generated `.md` page. Set `sitemapMd: false` to remove both.
- Nuxt Content v3 `page` collections: the `.md` route serves the source Markdown, not converted HTML. Set `contentSource: false` to convert HTML.
- Agent skills: every `skills/<name>/SKILL.md` in the project root or a local layer is published at `/.well-known/agent-skills/`, at `/skills/<name>/SKILL.md`, and in `llms.txt`. With one skill it is also served at `/SKILL.md`. Set `agentSkills: false` to publish nothing.

Off by default: Content Signals, MCP, WebMCP, runtime sync, cron, and the database.

## Common tasks

Add llms.txt sections. `notes` renders before the first heading:

```ts
export default defineNuxtConfig({
  aiReady: {
    llmsTxt: {
      sections: [{ title: 'API Reference', links: [{ title: 'REST API', href: '/docs/api', description: 'API docs' }] }],
      notes: 'Built with Nuxt AI Ready',
    },
  },
})
```

Remove an element from the Markdown on every path, build and runtime. Put it in `mdreamOptions`; the defaults `minimal` and `clean` stay on:

```ts
export default defineNuxtConfig({
  aiReady: { mdreamOptions: { filter: { exclude: ['.author-bio'] } } },
})
```

Change the Markdown text. Use both hooks if both paths must match:

```ts
// nuxt.config.ts: prerendered .md files and llms-full.txt
export default defineNuxtConfig({
  hooks: {
    'ai-ready:page:markdown': (ctx) => {
      ctx.markdown += '\n\nSee /support.'
    },
  },
})
```

```ts
// server/plugins/markdown.ts: runtime .md responses only
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:page:markdown', (ctx) => {
    ctx.markdown += '\n\nSee /support.'
  })
})
```

Allow Content Signals. An omitted permission renders as `no`:

```ts
export default defineNuxtConfig({ aiReady: { contentSignal: { search: true } } })
// robots.txt: Content-Signal: ai-train=no, search=yes, ai-input=no
```

MCP: install `@nuxtjs/mcp-toolkit` and add it to `modules`. The module then registers `list_pages`, `search_pages`, and `get_page_markdown` at `/mcp`. MCP needs a running server; `nuxi generate` output cannot host it.

WebMCP: set `webmcp: true`. This registers the same three tools in the browser and auto-imports `useWebMcpTool()` and `useWebMcpSupported()`. Without `webmcp`, those composables are not defined.

Runtime indexing, database drivers, Cloudflare D1, and the server query helpers: see [references/runtime-indexing.md](references/runtime-indexing.md).

## Traps

- **Nitro hooks do not run during prerender.** `ai-ready:mdreamConfig` and the Nitro `ai-ready:page:markdown` hook change only runtime `.md` responses. Prerendered `.md` files and `llms-full.txt` ignore them. Use `aiReady.mdreamOptions` and the Nuxt hook for build output.
- **Content source pages skip conversion hooks.** A Nuxt Content page ignores `mdreamOptions` and both Nitro hooks.
- **The runtime database starts empty on a fresh server.** Only the first MCP request, a cron run, or `POST /__ai-ready/restore` loads the prerendered dump. Until then `queryPages()`, `searchPages()`, `/__ai-ready/status`, and the WebMCP tools return nothing.
- **Dev has no page data.** Query helpers, MCP tools, and search return empty results in `nuxi dev`. Test with `nuxi build` and `node .output/server/index.mjs`.
- **Response caching turns negotiation off.** An ISR, `swr`, or `cache` route rule without `varies: ['accept', 'sec-fetch-dest', 'user-agent']` serves HTML to Markdown clients. The `.md` URL still works. For a CDN that caches by URL only, set `contentNegotiation: false`.
- **Emptying `ctx.markdown` does not hide a page.** It drops the body from `llms-full.txt`. The URL stays in `llms.txt` and in the index. Use `sitemap.exclude` for discovery, and access control for private pages.
- **A project `skills/` folder is public.** Agent skills discovery publishes it with no opt in. Rename the folder with `agentSkills.dir`, or set `agentSkills: false`.
- **The same hook name exists twice.** `ai-ready:page:markdown` is a Nuxt hook (`nuxt.config` `hooks`) and a Nitro hook (`nitroApp.hooks`). They receive different context.
- **`database: false` conflicts with `runtimeSync` and `cron`.** The build fails and names the option.

## Version limits

- v2 removed IndexNow. The `indexNow` option and `/__ai-ready/indexnow` no longer exist. Submit URLs from the `ai-ready:page:indexed` Nitro hook: https://nuxtseo.com/docs/ai-ready/advanced/indexnow
- v1 renamed these. Do not write the old form:

| Old | New |
|-----|-----|
| `mdreamOptions: { preset: 'minimal' }` | `mdreamOptions: { minimal: true }` |
| `cacheMaxAgeSeconds` | `llmsTxtCacheSeconds` |
| Nitro hook `ai-ready:markdown` | `ai-ready:page:markdown` |
| `BulkDocument` type | `PageDocument` |
| `JSON.parse(page.headings)` | `page.headings` (already an array) |
| `?secret=TOKEN` on `/__ai-ready/*` | `Authorization: Bearer TOKEN` header |

## Config

- `llmsTxt.markdownLinks` (`false`): link page entries in `llms.txt` to their `.md` twins.
- `describedby` (`true`): the `describedby` link tag and header.
- `tools.<listPages|searchPages|getPageMarkdown>.<mcp|webmcp>.enabled`: attach a built in tool to one transport only.
- `autoI18n` (`true`): with `@nuxtjs/i18n`, adds hreflang `Link` headers and a languages section in `llms.txt`.
- Other options: https://nuxtseo.com/docs/ai-ready/api/config

## Debug

- `curl -H 'Accept: text/markdown' -D - -o /dev/null <url>` must return `307` with `Location: <path>.md`. A `200` means a cache rule turned negotiation off.
- `/__ai-ready__/debug.json` exists in dev, or with `debug: true`.
- Nuxt DevTools has an AI Ready tab.
