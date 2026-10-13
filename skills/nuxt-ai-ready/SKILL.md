---
name: nuxt-ai-ready
description: Add, configure, or debug AI and LLM discoverability in a Nuxt site with the nuxt-ai-ready module. Use when a task mentions llms.txt, llms-full.txt, serving pages as Markdown (.md routes, Accept text/markdown), an MCP server for site content, WebMCP or useWebMcpTool, Content Signals in robots.txt, agent skills discovery, runtime page indexing, queryPages or searchPages, or the aiReady config key.
license: MIT
compatibility: "Requires Node.js ^22.22.3 || ^24.15.0 || >=26.0.0. Requires Nuxt ^4.6.0 || ^5.0.0."
---

# nuxt-ai-ready

Covers `nuxt-ai-ready` v3 on Nuxt 4.6 or Nuxt 5.
The module converts rendered pages to Markdown with mdream and publishes `llms.txt`, `llms-full.txt`, and `.md` twins.
Optional parts add MCP tools, WebMCP tools, and a runtime page index. Config key: `aiReady`. Docs: https://nuxtseo.com/ai-ready

## Setup

Included in `@nuxtjs/seo` v6. If the app uses `@nuxtjs/seo`, configure the `aiReady` key and do not add the module again.
Nuxt SEO uses AI Ready's own defaults. It overrides no `aiReady` option.
With these defaults the database stays off, so the app does not need `drizzle-orm`.

The package installs `@nuxtjs/robots` and `@nuxtjs/sitemap` and loads them as module dependencies. Configure them with the `robots` and `sitemap` keys.

```bash
npx nuxt module add nuxt-ai-ready
```

Set `site.url`. Canonical URLs, `Link` headers, and `/.well-known/ai-catalog.json` use it.
Prerender the pages you want in `llms-full.txt` and in the page index (`nuxt generate`, or `nitro.prerender.routes`).
A page visit in dev or production does not index anything.

## Automatic behaviour

With no `aiReady` config, the module adds:

- `/llms.txt`: site name, description, resource links, and current sitemap pages. Stored pages supply metadata. Large lists split under `/llms/`.
- `/llms-full.txt`: the full Markdown of each prerendered page. Only prerendered pages go in the static file.
- A `.md` twin per page. `/about` becomes `/about.md`, and `/` becomes `/index.md`. Paths under `/api` and `/_` get none.
- Accept negotiation: a request that prefers `text/markdown` gets a `307` to the `.md` URL. Responses send `Vary: Accept`. AI bot user agents get Markdown only with `botNegotiation: true`.
- `<link rel="alternate" type="text/markdown">` and `<link rel="describedby" href="/llms.txt">` in HTML, plus matching `Link` headers.
- `/sitemap.md`, and a `## Sitemap` footer on every generated `.md` page. Set `sitemapMd: false` to remove both.
- Nuxt Content v3 `page` collections: the `.md` route serves the source Markdown, not converted HTML. Set `contentSource: false` to convert HTML.
- Agent skills: `public/skills/<name>/SKILL.md` in the project or a local layer is published at `/.well-known/agent-skills/`, `/skills/<name>/SKILL.md`, and in `llms.txt`. Custom public directories are supported. One local skill is also served at `/SKILL.md`. Set `agentSkills: false` to publish nothing.
- `Content-Signal: search=yes, ai-input=yes` in `robots.txt`. Set `contentSignal: false` to remove it.

Off by default: MCP, WebMCP, runtime sync, cron, and the database.

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

Publish separate discovery files from named sitemaps. Use module configuration before writing sitemap and database middleware:

```ts
export default defineNuxtConfig({
  aiReady: {
    llmsFullTxt: false,
    llmsTxt: {
      markdownLinks: true,
      sitemaps: ['pages', 'skills', 'demos'],
      sections: [
        { title: 'Skills', sitemap: 'skills', path: '/llms/skills.txt' },
        { title: 'Demos', sitemap: 'demos', path: '/llms/demos.txt' },
      ],
    },
  },
})
```

The root links each section file. Chunked sitemaps keep their configured name.
Every file stays within `maxLength`, default 80,000 characters. Static builds emit every linked child.
GET and HEAD work on every generated discovery file. Empty sections produce no link or file.

For manual discovery, place `public/llms.txt`. The module preserves it and keeps Markdown conversion enabled.
If a server handler owns discovery, set `llmsTxt: false`.
Use `llmsFullTxt: false` instead of redirecting the full export to the index.

Remove an element from the Markdown on every path, build and runtime. Put it in `mdreamOptions`; the defaults `minimal` and `clean` stay on:

```ts
export default defineNuxtConfig({
  aiReady: { mdreamOptions: { filter: { exclude: ['.author-bio'] } } },
})
```

Change the Markdown text. The Nitro hook covers runtime `.md` responses, prerendered `.md` files, `llms-full.txt`, and indexed pages. `ctx.isPrerender` is `true` only during prerendering:

```ts
// server/plugins/markdown.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:page:markdown', (ctx) => {
    ctx.markdown += '\n\nSee /support.'
  })
})
```

Content Signals. Without config, robots.txt gets `Content-Signal: search=yes, ai-input=yes` and no `ai-train`. A robots group or merged robots.txt that already sets `Content-Signal` replaces the default. `contentSignal: false` removes the line. An object states the whole policy, so an omitted permission renders as `no`:

```ts
export default defineNuxtConfig({ aiReady: { contentSignal: { search: true, aiInput: true, aiTrain: false } } })
// robots.txt: Content-Signal: ai-train=no, search=yes, ai-input=yes
```

MCP: install `@nuxtjs/mcp-toolkit` and add it to `modules`. The module then registers `list_pages`, `search_pages`, and `get_page_markdown` at `/mcp`. These tools need the database, so also run `npx nypm add drizzle-orm@1.0.0-rc.4`. MCP needs a running server; `nuxt generate` output cannot host it. The server card is served at `/mcp/server-card`, `/.well-known/mcp/server-card.json`, and `/.well-known/mcp.json`. llms.txt links the card, never the endpoint, because the endpoint answers GET with 405 or 406. `mcpServerCard: false` removes the card routes and the llms.txt entry.

WebMCP: set `webmcp: true`. This registers the same three tools in the browser and auto-imports `useWebMcpTool()` and `useWebMcpSupported()`. The tools need the database and `drizzle-orm`. Without `webmcp`, those composables are not defined.

Runtime indexing, database drivers, Cloudflare D1, and the server query helpers: see [references/runtime-indexing.md](references/runtime-indexing.md).

## Traps

- **Discovery is not authorization.** Selected sitemaps exclude stale rows from `llms.txt`; they do not delete stored content or protect other APIs.
- **Custom route policies must allow Markdown twins.** If middleware rejects `/skills/planning.md`, allow it whenever `/skills/planning` is allowed.
- **The same edit in both hooks applies twice.** During prerendering the Nitro `ai-ready:page:markdown` hook runs, then the Nuxt hook of the same name. Put an edit in one of them, not both.
- **Content source pages skip conversion hooks.** A Nuxt Content page ignores `mdreamOptions` and both Nitro hooks.
- **Dev has no page data.** Query helpers, MCP tools, and search return empty results in `nuxt dev`. Test with `nuxt build` and `node .output/server/index.mjs`.
- **Cloudflare static pages negotiate only with `contentNegotiation: true`.** The default leaves prerendered HTML on the asset service, so `Accept: text/markdown` gets HTML there. With `true`, prerendered pages go into `assets.run_worker_first`: exact paths up to Cloudflare's 100 entries, directory globs such as `/docs/*` past that. More than 100 top-level pages fail the build; set broader patterns yourself.
- **Response caching turns negotiation off.** An ISR, `swr`, or `cache` route rule without `varies: ['accept']` serves HTML to Markdown clients. With `botNegotiation: true`, the rule needs `varies: ['accept', 'sec-fetch-dest', 'user-agent']`. The `.md` URL still works. For a CDN that caches by URL only, set `contentNegotiation: false`.
- **Emptying `ctx.markdown` does not hide a page.** It drops the body from `llms-full.txt`. The URL stays in `llms.txt` and in the index. Use `sitemap.exclude` for discovery, and access control for private pages.
- **Root `skills/` folders require explicit publication.** Automatic discovery scans public directories only. Set `agentSkills.dir: 'skills'` to publish root skills intentionally.
- **The same hook name exists twice.** `ai-ready:page:markdown` is a Nuxt hook (`nuxt.config` `hooks`, prerender only) and a Nitro hook (`nitroApp.hooks`, every HTML conversion). They receive different context. The Nitro `ctx.event` is undefined when indexing runs outside a request.
- **`database: false` conflicts with `runtimeSync` and `cron`.** The build fails and names the option.
- **A database feature without `drizzle-orm` 1.x fails the build.** `runtimeSync`, `cron`, MCP site tools, WebMCP site tools, and an explicit `database` option turn on the database. A `drizzle-orm` 0.x install fails too. The error names the feature and the install command. If MCP Toolkit serves only your own tools, set `database: false` instead.

## Version limits

- v3 requires Nuxt `^4.6.0 || ^5.0.0` and Node `^22.22.3 || ^24.15.0 || >=26.0.0`. Upgrade Nuxt before the module.
- v3 does not install `drizzle-orm`. It is an optional peer. If a feature uses the database, run `npx nypm add drizzle-orm@1.0.0-rc.4`.
- v3 removed the `better-sqlite3` fallback. SQLite uses `node:sqlite`. Remove `better-sqlite3` if only this module used it.
- v3 negotiates on `Accept` only. To serve Markdown to AI bot user agents again, set `botNegotiation: true` and vary caches on `accept`, `sec-fetch-dest`, and `user-agent`.
- v3 discovers skills in `public/skills/<name>/SKILL.md` by default. Root `skills/` stays private. Move public skills, or set `agentSkills.dir: 'skills'`.
- v3 needs `@nuxtjs/robots` v7, `@nuxtjs/sitemap` v9, and `nuxt-site-config` v5. Upgrade direct dependencies on them.
- v3 adds typed entries. Import server functions from `#ai-ready/server` and app functions from `#ai-ready/app`.
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

- `llmsTxt` (`object`): generated discovery. Set `false` for application-owned server routes. A public `llms.txt` disables generation automatically.
- `llmsTxt.pages` (`'sitemap'`): sitemap admission. Use `'all'` for stored pages outside the sitemap, or `false` for configured sections only.
- `llmsTxt.sitemaps`: selected sitemap names. An empty array stops sitemap discovery.
- `llmsTxt.maxLength` (`80000`): maximum characters per file. Minimum `1024`. Larger lists split without dropping links.
- `llmsFullTxt` (`true`): generate the full export and advertise its link. Set `false` to omit both.
- `llmsTxt.directive` (`{ markdown: true, html: false }`): a `> Index of every page on this site: [llms.txt](...)` line after the frontmatter of each page's `.md`; `html: true` adds a visually hidden `/llms.txt` link at the top of each HTML body.
- `llmsTxt.markdownLinks` (`true`): link page entries in `llms.txt` to their `.md` twins. `false` links canonical URLs. With `site.url` set, page links in `llms.txt`, `sitemap.md`, and `.md` bodies are absolute.
- `describedby` (`true`): the `describedby` link tag and header.
- `tools.<listPages|searchPages|getPageMarkdown>.<mcp|webmcp>.enabled`: attach a built in tool to one transport only.
- `autoI18n` (`true`): with `@nuxtjs/i18n`, adds hreflang `Link` headers and a languages section in `llms.txt`.
- Other options: https://nuxtseo.com/docs/ai-ready/api/config

## Debug

- `curl -H 'Accept: text/markdown' -D - -o /dev/null <url>` must return `307` with `Location: <path>.md`. A `200` means a cache rule turned negotiation off.
- `/__ai-ready__/debug.json` exists in dev, or with `debug: true`.
- Nuxt DevTools has an AI Ready tab. The panel needs `nuxtseo-devtools-host` as a dev dependency.
