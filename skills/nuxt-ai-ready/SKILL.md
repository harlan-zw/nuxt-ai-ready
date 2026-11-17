---
name: nuxt-ai-ready
description: Add, configure, or debug AI and LLM discoverability in a Nuxt site with the nuxt-ai-ready module. Use when a task mentions llms.txt, llms-full.txt, serving pages as Markdown (.md routes, Accept text/markdown), an MCP server for site content, WebMCP or useWebMcpTool, Content Signals in robots.txt, agent skills discovery, runtime page indexing, queryPages or searchPages, or the aiReady config key.
license: MIT
compatibility: "Requires Node.js ^22.22.3 || ^24.15.0 || >=26.0.0. Requires Nuxt ^4.6.0 || ^5.0.0."
---

# nuxt-ai-ready

Covers `nuxt-ai-ready` v3 on Nuxt 4.6 or Nuxt 5.
The module converts rendered pages to Markdown with mdream and publishes `llms.txt`, `llms-full.txt`, and a `.md` twin per page. Config key: `aiReady`. Docs: https://nuxtseo.com/ai-ready

## Setup

```bash
npx nuxt module add nuxt-ai-ready
```

Included in `@nuxtjs/seo` v6: configure `aiReady`, do not add the module again. Nuxt SEO keeps AI Ready's defaults: database off, no `drizzle-orm` needed.
The package loads `@nuxtjs/robots` and `@nuxtjs/sitemap`; configure them with the `robots` and `sitemap` keys.
Set `site.url`: canonical URLs, `Link` headers, and `/.well-known/ai-catalog.json` use it.
Prerender the pages you want in `llms-full.txt` and the page index (`nuxt generate`, or `nitro.prerender.routes`). A page visit indexes nothing.

## Automatic behaviour

With no `aiReady` config:

- `/llms.txt`: site summary and sitemap pages. Large lists split under `/llms/`.
- `/llms-full.txt`: full Markdown of each prerendered page.
- A `.md` twin per page: `/about` becomes `/about.md`. Paths under `/api` and `/_` get none.
- Accept negotiation: a request that prefers `text/markdown` gets a `307` to the `.md` URL and `Vary: Accept`. `botNegotiation: true` extends this to AI bot user agents.
- `<link rel="alternate" type="text/markdown">` and `describedby` links, plus matching `Link` headers.
- `/sitemap.md` and a `## Sitemap` footer on generated `.md` pages; `sitemapMd: false` removes both.
- Nuxt Content v3 `page` collections: the `.md` route serves source Markdown; `contentSource: false` converts HTML.
- Agent skills in `public/skills/<name>/SKILL.md` publish at `/.well-known/agent-skills/` and in `llms.txt`; `agentSkills: false` disables.
- `Content-Signal: search=yes, ai-input=yes` in `robots.txt`; `contentSignal: false` removes it.
- Off by default: MCP, WebMCP, runtime sync, cron, and the database.

## Common tasks

Add llms.txt sections and notes; `notes` renders before the first heading:

```ts
export default defineNuxtConfig({
  aiReady: {
    llmsTxt: {
      sections: [{ title: 'Skills', sitemap: 'skills', path: '/llms/skills.txt' }],
      notes: 'Built with Nuxt AI Ready',
    },
  },
})
```

Every generated file stays within `llmsTxt.maxLength` (default 80,000); empty sections produce no link or file.
For application-owned discovery, place `public/llms.txt` (preserved as is) or set `llmsTxt: false`.

Rewrite the Markdown of every response with the Nitro hook (runtime `.md`, prerendered `.md`, `llms-full.txt`, indexed pages):

```ts
// server/plugins/markdown.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:page:markdown', (ctx) => {
    ctx.markdown += '\n\nSee /support.'
  })
})
```

Drop an element from every conversion with `mdreamOptions`, e.g. `aiReady: { mdreamOptions: { filter: { exclude: ['.author-bio'] } } }`; the `minimal` and `clean` defaults stay on.

Content Signals: a `contentSignal` object states the whole policy, so an omitted permission renders as `no`:

```ts
export default defineNuxtConfig({ aiReady: { contentSignal: { search: true, aiInput: true, aiTrain: false } } })
// robots.txt: Content-Signal: ai-train=no, search=yes, ai-input=yes
```

MCP: install `@nuxtjs/mcp-toolkit`, add it to `modules`; it registers `list_pages`, `search_pages`, and `get_page_markdown` at `/mcp`. WebMCP: set `webmcp: true` for the same tools in the browser plus the `useWebMcpTool()` composable. Both need the database, so run `npx nypm add drizzle-orm@1.0.0-rc.4`. `nuxt generate` output cannot host MCP.

Runtime indexing, database drivers, Cloudflare D1, and the query helpers: see [references/runtime-indexing.md](references/runtime-indexing.md).

## Traps

- **Discovery is not authorization.** Selected sitemaps exclude stale rows from `llms.txt`; they do not delete stored content or protect other APIs.
- **Custom route policies must allow Markdown twins.** If middleware rejects `/skills/planning.md`, allow it whenever `/skills/planning` is allowed.
- **The same hook name exists twice.** `ai-ready:page:markdown` is a Nuxt hook (prerender only) and a Nitro hook (every conversion) with different context; an edit in both applies twice. The Nitro `ctx.event` is undefined outside a request.
- **Content source pages skip conversion hooks** and ignore `mdreamOptions`.
- **Dev has no page data.** Query helpers, MCP tools, and search return empty results in `nuxt dev`. Test with `nuxt build` and `node .output/server/index.mjs`.
- **Cloudflare static pages negotiate only with `contentNegotiation: true`.** It moves prerendered pages into `assets.run_worker_first`: exact paths up to Cloudflare's 100 entries, then globs such as `/docs/*`. Over 100 top-level pages fail the build.
- **Response caching turns negotiation off.** An ISR, `swr`, or `cache` route rule without `varies: ['accept']` serves HTML to Markdown clients; with `botNegotiation: true` the rule needs `varies: ['accept', 'sec-fetch-dest', 'user-agent']`. The `.md` URL still works.
- **Emptying `ctx.markdown` does not hide a page.** It drops the body from `llms-full.txt`; the URL stays in `llms.txt` and the index. Use `sitemap.exclude` and access control.
- **Root `skills/` folders stay private.** Discovery scans public directories only; `agentSkills.dir: 'skills'` publishes them.
- **`database: false` conflicts with `runtimeSync` and `cron`;** the build fails and names the option. A database feature without `drizzle-orm` 1.x fails too. If MCP Toolkit serves only your own tools, set `database: false`.

## Version limits

- v3 requires Nuxt `^4.6.0 || ^5.0.0`; upgrade Nuxt before the module. It needs `@nuxtjs/robots` v7, `@nuxtjs/sitemap` v9, and `nuxt-site-config` v5.
- v3 does not install `drizzle-orm`. Database features need `npx nypm add drizzle-orm@1.0.0-rc.4`. SQLite uses `node:sqlite`; remove leftover `better-sqlite3`.
- v3 negotiates on `Accept` only; set `botNegotiation: true` to serve Markdown to AI bot user agents.
- v3 exports typed entries: server functions from `#ai-ready/server`, app functions from `#ai-ready/app`.
- v2 removed IndexNow. Submit URLs from the `ai-ready:page:indexed` Nitro hook.
- v1 renamed options. Do not write the old form:

| Old | New |
|-----|-----|
| `mdreamOptions: { preset: 'minimal' }` | `mdreamOptions: { minimal: true }` |
| `cacheMaxAgeSeconds` | `llmsTxtCacheSeconds` |
| Nitro hook `ai-ready:markdown` | `ai-ready:page:markdown` |
| `?secret=TOKEN` on `/__ai-ready/*` | `Authorization: Bearer TOKEN` header |

## Config

- `llmsTxt` (`object`): generated discovery. Set `false` for application-owned server routes; a public `llms.txt` disables generation.
- `llmsTxt.pages` (`'sitemap'`): `'all'` includes stored pages outside the sitemap.
- `llmsTxt.markdownLinks` (`true`): link page entries to `.md` twins instead of canonical URLs.
- `autoI18n` (`true`): with `@nuxtjs/i18n`, adds hreflang `Link` headers and a languages section in `llms.txt`.
- Other options: https://nuxtseo.com/docs/ai-ready/api/config

## Debug

For example, a deployed page with negotiation enabled:

```bash
curl -s -H 'Accept: text/markdown' -D - -o /dev/null https://mysite.com/about
HTTP/1.1 307 Temporary Redirect
location: /about.md
vary: accept
```

A `200` means a cache rule turned negotiation off. `/__ai-ready__/debug.json` exists in dev, or with `debug: true`. Nuxt DevTools has an AI Ready tab (needs `nuxtseo-devtools-host`).
