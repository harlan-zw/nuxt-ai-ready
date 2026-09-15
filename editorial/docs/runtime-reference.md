# Runtime and reference briefs

State: draft ready. Writer: runtime-reference agent. Brief reviewer: root, approved 2026-09-15.
Parent: `3a01b0fcac5944641cfd2a0ac3e5688d9d820078`. Module: 2.3.3. Checked: 2026-09-15.

Policies: [Sources](SOURCES.md), [Claims](VERIFIED-CLAIMS.md), [Copy](COPY.md), [Screenshots](SCREENSHOTS.md).
Scope: the ten pages below. No URL moves, runtime edits, new product names, or release-history modernization.
All existing heading anchors stay. Add missing reference sections without renaming existing ones.
Search demand is unmeasured. Examples are synthetic. No paid external requests or authenticated deployments were tested.
These reference pages need no instructional figures. Root owns rendered desktop/mobile evidence and canonical checks.
Editorial records stay outside the `docs/content/**/*.md` collection boundary documented in SOURCES.md.

## Checked claims

Observed means implementation inspection, not a live service result. Paths are relative to the frozen parent.

| ID | Status and kind | Checked claim | Evidence and limits |
| --- | --- | --- | --- |
| RR-01 | Observed, implementation | Runtime sync or cron generates a secret if config and environment supply none. CLI reads its local cache file. | `src/module.ts:738`, `src/cli.ts:9`; remote deployment must use the same secret. |
| RR-02 | Observed, implementation | Status, poll, restore, reindex and non-dry prune authenticate. Cron route exists only with cron enabled outside dev. | `src/module.ts:1054`, `src/runtime/server/routes/__ai-ready/*`; dry prune is the exception. |
| RR-03 | Observed, implementation | Runtime sync seeds sitemap routes, then poll or cron indexes pages. Reindex may index a supplied live route. | `plugins/sitemap-seeder.ts`, `utils/batchIndex.ts`, `routes/__ai-ready/reindex.post.ts` under `src/runtime/server`; no afterResponse indexing. Poll/cron only process pending rows; TTL expiry alone does not reindex healthy stored pages. |
| RR-04 | Observed, implementation | D1 persists data. Empty storage restores the dump; changed build IDs compare hashes and mark changed rows pending. | `src/runtime/server/utils/checkStale.ts:110`; missing dumps do not guarantee available data. |
| RR-05 | Observed, implementation | Public headings are arrays. Route queries return one page or undefined. `indexPageByRoute` requires an event argument, which may be undefined. | `src/runtime/server/db/queries.ts:183,319`, `src/runtime/server/utils/indexPage.ts`; raw result.data.headings remains serialized JSON. |
| RR-06 | Observed, implementation | Indexed hook fires after writing content hash and includes contentChanged; unchanged forced indexes still call it. | `src/runtime/server/utils/indexPage.ts:100`; skipHook suppresses it. Hook failure does not undo the database write. |
| RR-07 | Observed, implementation | MCP page listing emits headings arrays and no updatedAt. Resources default to 100 pages, maximum 500. | `src/runtime/server/mcp/tools/list-pages.ts`, `resources/pages.ts`; configured cache durations are 1h and 5m. |
| RR-08 | Observed, implementation | [SQLite](https://sqlite.org) search uses FTS5; Postgres search uses ILIKE with zero score. Search returns no results during dev/prerender. | `src/runtime/server/db/queries.ts:443`; do not call all providers FTS5/BM25. |
| RR-09 | Observed, implementation | Runtime markdown conversion hooks require the conversion path. mdream options.origin is the origin, not the route. | `src/runtime/server/utils.ts:116`; route is available on MarkdownContext, not mdreamConfig payload. indexPage passes no hooks option, so these conversion hooks do not run during manual indexing. |
| RR-10 | Observed, implementation | Nuxt prerender hook persists the changed markdown; llms-txt hook mutates config during module setup. | `src/prerender.ts:262`, `src/module.ts:451`; title changes in that hook are not a metadata persistence promise. |
| RR-11 | Observed, implementation | llms-full pages have metadata boundaries; renderer removes YAML frontmatter and trims Markdown. | `src/runtime/server/utils/llms-full.ts`; delimiter is a serialization convention, not a general Markdown parser. |
| RR-12 | Documented, official docs | text-embedding-3-small defaults to 1536 dimensions. | https://developers.openai.com/api/docs/guides/embeddings, checked 2026-09-15; no paid embedding call. |
| RR-13 | Documented, official docs | sqlite-vec loads with better-sqlite3 and supports vec0 MATCH with k. | https://alexgarcia.xyz/sqlite-vec/js.html and https://alexgarcia.xyz/sqlite-vec/features/knn.html; LIMIT variant depends on SQLite version. |
| RR-14 | Documented, official docs | D1 requires a binding. Workers cron invokes scheduled handlers. NuxtHub current config uses hub.db. | https://developers.cloudflare.com/d1/get-started/, https://developers.cloudflare.com/workers/configuration/cron-triggers/, https://hub.nuxt.com/docs/database; no live [Cloudflare](https://cloudflare.com) account check. |
| RR-15 | Observed, historical implementation | v1 introduced renamed options/types/hooks, array headings, Bearer auth and deprecation shims. | `git show v1.0.0:src/runtime/types.ts`, `git show v1.0.0:src/runtime/server/utils/auth.ts`, commit 854551f8b5f321acaa090bc0dfd5c3452c8f19fd. |
| RR-16 | Withdrawn, unsupported historical performance | “up to 8x faster” lacks a benchmark source in this release record. | Remove number while preserving historical Rust/WASM/JS migration. The current code cannot verify a historical speedup. |
| RR-17 | Observed, implementation | Restore returns cleared:boolean, not a deleted-row count. Poll all mode still caps each request at 50 pages. | `src/runtime/server/routes/__ai-ready/restore.post.ts:39`; CLI example must not fabricate a number. |
| RR-18 | Documented, official docs | Upstash accepts vector upserts with IDs and metadata. | https://upstash.com/docs/vector/sdks/ts/commands/upsert; no hosted index call. |

## Per-page briefs

### MCP

- File: `docs/content/2.guides/3.mcp.md`; route: `/docs/ai-ready/guides/mcp`; group: Guides.
- Reader: Nuxt developer. Question: How can an MCP client query my indexed pages?
- Outcome: Install Toolkit, expose the endpoint, understand tool output and data prerequisites.
- Claims: RR-07, RR-08. Sources: MCP tool/resource files, `src/utils/mcp.ts`, server-card resolver; https://mcp-toolkit.nuxt.dev/advanced/hooks.
- Outline: install and connect first; tools and resources; indexing prerequisites; optional discovery and customization.
- Corrections: actual headings and response fields, consistent hasMore example, resource pagination, provider-specific search. Avoid hard-coded unverified desktop client package.
- Checks: compare response example with handler mapping and schema; validate JSON; inspect installed Toolkit route/client docs. Discovery remains explicitly experimental.
- Related: installation, runtime indexing, configuration. Excludes new client support guarantees.

### Runtime indexing

- File: `docs/content/2.guides/4.runtime-indexing.md`; route: `/docs/ai-ready/guides/runtime-indexing`; group: Guides.
- Reader: developer whose public content changes between deploys. Question: How do I keep stored page data current?
- Outcome: configure runtime sync, authenticate, trigger poll, then choose cron and storage.
- Claims: RR-01 through RR-06, RR-08. Sources: module route registration, auth, seeder, batchIndex and checkStale implementation.
- Outline: deployment-time vs runtime decision; minimal config; real curl request; endpoint options; schedules; storage; hook/manual advanced paths.
- Corrections: status authentication, remove deprecated query-secret option, use valid JSON output, cold-start qualifications, required cron setting. Replace unsafe unprotected arbitrary-path endpoint examples with fixed trusted routes or built-in authenticated endpoint.
- Checks: auth and endpoint call trace; syntax of curl/config; hook example uses contentChanged and explains post-write failure. No external indexing trigger.
- Related: CLI, Cloudflare, composables, Nitro hooks. Excludes CMS credential and queue implementations.

### Cloudflare

- File: `docs/content/2.guides/5.cloudflare.md`; route: `/docs/ai-ready/guides/cloudflare`; group: Guides.
- Reader: existing Nuxt deployer. Question: How do I attach D1 and schedule page indexing?
- Outcome: matching D1 binding and module config; supported Workers or Pages trigger.
- Claims: RR-02, RR-03, RR-04, RR-14. Sources: D1 official guide, Nitro/module scheduledTasks integration, checkStale.
- Outline: D1 create/bind/config; restoration behavior; NuxtHub note; Workers schedule; Pages external request.
- Corrections: remove stale afterResponse and empty-only redeploy diagram, fix Pages cron:true, avoid obsolete hub.database:true, keep generated Wrangler file ownership clear.
- Checks: trace exact cron registration and bindingName; make curl fail on HTTP errors; external secrets supplied through workflow env. No real D1, NuxtHub provision, or deployment verified.
- Related: runtime indexing and configuration. Excludes full platform deployment tutorial.

### CLI

- File: `docs/content/2.guides/7.cli.md`; route: `/docs/ai-ready/guides/cli`; group: Guides.
- Reader: developer/operator. Question: How do I inspect and refresh a running site's index?
- Outcome: choose command and authenticate to the intended environment.
- Claims: RR-01, RR-02, RR-17. Sources: `src/cli.ts` argument definitions and fetch callers.
- Outline: installed command; secret provenance; commands; dev/deploy workflows; recovery.
- Corrections: production/local random secret mismatch, no env-only CLI auth promise, restore boolean response, clarify shortened synthetic output and bounded --all behavior.
- Checks: source argument comparison and command help if feasible; no network mutation. CI example must create/read same cache secret as deployed app.
- Related: runtime indexing/config. Excludes new CLI flags.

### RAG

- File: `docs/content/3.advanced/0.rag-example.md`; route: `/docs/ai-ready/advanced/rag-example`; group: Advanced.
- Reader: developer familiar with embedding APIs. Question: How do I turn exported Markdown into searchable vectors?
- Outcome: parse this module's export, create bounded chunks, embed and retrieve with source metadata.
- Claims: RR-11 through RR-13, RR-18. Sources: formatter and linked provider docs.
- Outline: explain small synthetic recipe and dependencies; fetch checked response; parse metadata; embeddings; sqlite-vec or Upstash; retrieval; larger-input chunking; build invocation.
- Corrections: fetch status/metadata checks, remove unchanged-frontmatter claim, bound concurrency, preserve heading markers, show required dependencies/env, use k query, identify memory-only database and separate Upstash query path.
- Checks: replay parser on formatter output including missing description and malformed metadata; syntax-check extracted examples; no paid embedding/vector calls. Provider size/rate limits remain linked prerequisites.
- Related: llms.txt, Markdown. Excludes production retry/queue implementation and answer generation.

### Nuxt hooks

- File: `docs/content/3.api/1.nuxt-hooks.md`; route: `/docs/ai-ready/api/nuxt-hooks`; group: API.
- Reader: module integrator. Question: Which build hooks change exported content?
- Outcome: choose hook, mutate supported field, understand its timing.
- Claims: RR-10. Sources: ModuleHooks and prerender call sites.
- Outline: build/runtime distinction; existing two hook references; agent-skills hook pointer.
- Corrections: avoid unsafe YAML interpolation and duplicate frontmatter; optional llms sections type; setup timing, not every response; sitemap timestamp qualification.
- Checks: hook payload typings and mutation consumers; syntax. No runtime hooks advertised here.
- Related: Nitro hooks, llms.txt, agent skills.

### Configuration

- File: `docs/content/3.api/5.config.md`; route: `/docs/ai-ready/api/config`; group: API.
- Reader: developer configuring a specific option. Question: What does each option enable and default to?
- Outcome: accurate config/default reference with concise adjacent caveats.
- Claims: RR-01, RR-02, RR-04, RR-08 plus module defaults and runtime types.
- Outline: preserve option headings; minimal context and one useful example each; complete missing contentSource entry.
- Corrections: generated secret default, qualified no-database behavior, driver auto-detection precision, remove universal safe/shared-table guarantee and unverified external spec mandate. Keep proposal status with protocol features.
- Checks: compare every documented option/default to runtime/types and module defaults; coordinate repeated fundamentals claims with root. Existing anchors remain.
- Related: existing per-feature guides. Excludes runtime changes and new names.

### Composables

- File: `docs/content/3.nitro-api/1.composables.md`; route: `/docs/ai-ready/nitro-api/composables`; group: Nitro API.
- Reader: server-route author. Question: How do I read and update indexed page data safely?
- Outcome: correct return shapes, supplied event, and bounded query examples.
- Claims: RR-05, RR-08. Sources: `src/runtime/server/db/queries.ts`, exports template, indexPage and raw adapter.
- Outline: storage/server prerequisites; queries and types; count/stream; trusted indexing; database access.
- Corrections: query overload shapes, parsed headings, optional event argument distinctions, SQL score qualification, declared input checks, avoid unauthenticated arbitrary URL fetch and startup indexing without request context.
- Checks: exported symbols and signatures, syntax; count example scope excludes errors. No exposed admin API added.
- Related: config and Nitro hooks. Excludes database schema migrations.

### Nitro hooks

- File: `docs/content/3.nitro-api/2.nitro-hooks.md`; route: `/docs/ai-ready/nitro-api/nitro-hooks`; group: Nitro API.
- Reader: runtime integration author. Question: Where can I supply Markdown or react to changed indexed content?
- Outcome: select correct runtime hook with valid payload and timing.
- Claims: RR-05, RR-06, RR-09. Sources: runtime/types, utils conversion, source middleware, indexPage.
- Outline: conversion hooks; mdream options; indexed content hook; manual utility cross-link; add missing markdown:source hook.
- Corrections: origin-only mdreamConfig condition, parsed headings and contentChanged, duplicate const result, explain database write before hook and skip behavior.
- Checks: compile isolated examples, trace all hooks; no undefined application helpers disguised as complete examples.
- Related: markdown, Nuxt hooks, config, IndexNow recipe.

### v1 release

- File: `docs/content/4.releases/1.v1.md`; route: `/docs/ai-ready/releases/v1`; group: Releases.
- Reader: historical upgrader. Question: What changed when upgrading to v1?
- Outcome: retain period-specific migration details and identify historical scope.
- Claims: RR-15, RR-16. Sources: v1.0.0 tag, 854551f and 931e6ef commits, historical auth/types.
- Outline: retain current historical sections/anchors; concise scope note; migration examples and old release fixes.
- Corrections: remove unsupported speed number, no automatic-upgrade guarantee, clarify planned v2 shim removal was a historical plan because current source retains query fallback.
- Checks: git show historical source; do not replace historical IndexNow or headings migration with current feature behavior. Preserve dates and links.
- Related: current introduction for new installations. Excludes rewriting release history as v2 instructions.

## Review and writing log

Brief review: root approved all ten page briefs on 2026-09-15 before article edits.
Article review: pending independent reviewer and root rendered checks.
After approval: separate factual pass, surface humanize pass, structural humanize pass, then meaning/example recheck per page.
Planned representative surface fixes: “faster and simpler”, “clean markdown optimized”, “upgrade automatically”, dangling explanatory code comments.
Planned structural fixes: put authentication and data prerequisites before commands; remove duplicate summaries and unsupported example helpers.

## Completed factual and humanize passes

Factual pass: compared current public exports, hook call sites, endpoint registration, defaults, and historical v1 source before rewriting.
Root review added pending-only polling and hook-path corrections. Those corrections are included in all affected owned pages.
A further source trace found `all=true` still caps one request at 50 pages. The runtime and CLI guides now explain that limit.
`useDatabase` has no current export. Its heading stays as a migration anchor, with `useRawDb` as the working example.
`contentSource`, `prerender.concurrency`, and `debugCron` now have reference entries with inspected consumers.

Both humanize passes completed per page, then claims and examples were checked again:

| Page | Surface pass, representative before and after | Structural pass, actual change |
| --- | --- | --- |
| MCP | “support via” became “Use ... to let clients list, search, and read your indexed pages.” | Moved optional experimental discovery after connection, tools, data prerequisites, and configuration. Removed unverified client-package instructions. |
| Runtime indexing | “faster and simpler” became “prerender the pages during that deployment.” | Replaced decorative flow box with the actual seeding and indexing sequence. Put Bearer auth beside the first curl command. |
| Cloudflare | “Key difference from serverless” became specific D1 persistence and build-change behavior. | Removed obsolete deployment flow and NuxtHub config. Kept binding setup first and Pages-specific scheduling later. |
| CLI | “provides commands for managing” became “Use ... to inspect stored pages.” | Explained secret provenance before commands. Qualified dev mode, bounded all mode, and the shared CI build secret. |
| RAG | “clean markdown optimized for vectorizing” became “Use llms-full.txt to build a small vector-search example.” | Added dependencies and paid-call scope first. Kept a sequential local example and separated Upstash as an alternative. |
| Nuxt hooks | “Mutable pattern” became “Change the arrays directly.” | Introduced build/runtime scope before references. Replaced YAML interpolation with a plain Markdown change. |
| Configuration | “without risk of overwriting user tables” became “Do not reuse the same table names for other data.” | Split the long Agent Skills paragraph into discovery, routes, and options. Kept storage caveats beside their defaults. |
| Composables | “Unified page query function” became explicit array versus single-page return behavior. | Put storage and server prerequisites first. Replaced arbitrary fetch endpoints with fixed-route publishing helpers. |
| Nitro hooks | “sync with external systems like” became “Check contentChanged before updating another system.” | Separated conversion, source, and indexed hooks. Explained database-write timing beside the external-integration example. |
| v1 | Removed “up to 8x faster” and “upgrade automatically.” | Added historical scope before migration instructions. Preserved historical IndexNow details and labeled shim removal as the release’s plan. |

## Validation record

Checked 2026-09-15 on the draft branch. Replay helper: [check-runtime-examples.mjs](check-runtime-examples.mjs).
Run from the repository root:

```bash
node editorial/docs/check-runtime-examples.mjs
```

Observed results:

- 58 extracted JavaScript/TypeScript fences compile. JSON fences parse.
- The original Nitro manual example fails compilation because it declares `result` twice.
- The original RAG parser accepts missing Source metadata and invents `https://example.com/undefined`.
- The revised parser rejects that input and non-HTTP sources.
- Revised parser handles actual current formatter output, optional descriptions, CRLF, frontmatter removal, and multiple pages.
- The extracted indexed hook skips unchanged content and handles changed content once.

These checks execute article snippets and the formatter function. They do not establish live embedding, sqlite-vec, Upstash, D1, or MCP client integration.
No paid API calls, account provisioning, broad build, test suite, or dev server ran in this worker.
Root owns rendered routes, canonical links, and desktop/mobile checks.
Independent final article review remains pending.

Scoped [ESLint](https://eslint.org) passed for all ten articles and the replay helper with zero warnings.
Heading inventory comparison found no removed headings in any owned page. URLs and existing anchors remain unchanged.


## Independent review repairs

Reviewer found that the mdreamConfig example retained unsupported `ignoreElements`.
Added a behavioral replay before changing the example. The old example left Biography text in converted Markdown and failed.
The corrected `filter.exclude` example removes that text with mdream 1.7.1 and preserves an existing exclusion.
The replay also checks that ordinary article content remains.

The same revision scopes locale frontmatter to runtime HTML conversion and removes the obsolete page-data.jsonl output claim.
Nuxt hook timing now covers all prerendering, including ordinary builds with configured prerender routes.
Historical v1 authentication now names protected endpoints; prune dry runs remain exempt, matching the v1 source.

Surface humanize pass: retained simple sentences and exact option names; removed “All” from the historical authentication claim.
Structural humanize pass: kept filtering immediately beside conversion scope and preserved existing hook headings.
Meaning recheck: filter mutation preserves the existing filter object and excludes; the hook still has no route field.

Validation: `node editorial/docs/check-runtime-examples.mjs` passes all previous checks plus real mdream filtering.
The first run failed against a63c643 before the example changed. No external service calls ran.

## Collection handoff

Independent article review accepted the corrected revision. The coordinator verified all routes, metadata, and rendered fragments.
See [the collection ledger](LEDGER.md) for final checks and publication limits.
