# Fundamentals refresh brief

[Sources](SOURCES.md), [Claims](VERIFIED-CLAIMS.md), [Copy](COPY.md), [Screenshots](SCREENSHOTS.md), [Ledger](LEDGER.md).

Writer: fundamentals agent. Independent brief reviewer: coordinator, approved 2026-09-15.
Base commit: `3a01b0fcac5944641cfd2a0ac3e5688d9d820078`.
Branch: `docs/refresh-fundamentals`. Source checked: 2026-09-15, Nuxt AI Ready 2.3.3, Nuxt 4.5.2, mdream 1.7.1.
Scope: the nine pages below. No runtime edits, new routes, new product terms, live service calls, or browser work.
Search demand: not measured. This technical refresh follows the user's collection request.
All dates and routes stay unchanged. Preserve existing headings unless a factual correction requires a change.
Publication: coordinator aggregates local commits into the collection PR. No independent push, PR, merge, or deployment.

## Evidence

Implementation inspection supports module behavior only. It does not prove external adoption, crawler compliance, or browser agent success.
External documents were opened on 2026-09-15. Their relevant scopes follow.

| ID | Status | Kind | Claim and qualifications | Evidence |
| --- | --- | --- | --- | --- |
| F-01 | Observed | Implementation | Markdown, llms.txt, stored-page export, optional MCP, signals, skills, and catalogs have distinct prerequisites. | `src/module.ts:118`, `src/module.ts:390`, `src/module.ts:539`; handlers under `src/runtime/server/routes/` |
| F-02 | Observed | Implementation | Runtime indexing uses polling, scheduled tasks, or manual utilities. Page visits do not index content. Polling selects pending rows; TTL expiry does not reindex healthy stored rows. Static output cannot host the server MCP endpoint. | `src/runtime/server/plugins/sitemap-seeder.ts`; `src/runtime/server/tasks/ai-ready-cron.ts`; `src/runtime/server/utils/indexPage.ts`; `src/module.ts:539` |
| F-03 | Observed | Implementation | Native Node SQLite starts at Node 22.13, Node 23.4, and later major versions. Vercel chooses Neon when POSTGRES_URL exists. | `src/utils/database.ts:6`, `src/utils/database.ts:90` |
| F-04 | Observed | Implementation | Content Signals are off by default. Enabled omitted booleans emit no. Content-Usage can be disabled inside contentSignal. Required Robots version is >=6.0.0. | `src/module.ts:118`, `src/module.ts:390` |
| F-05 | Documented | Primary draft | Content-Usage expresses preferences through HTTP or robots.txt. train-ai=y/n is a documented example. A draft does not establish crawler compliance. | https://ietf-wg-aipref.github.io/drafts/draft-ietf-aipref-attach.html |
| F-06 | Observed | Implementation | Accept negotiation follows mdream negotiation and AI bot classification, with route cache policy. It is not the existing simple Accept exclusion rule. Negotiated Markdown uses a 307 redirect. | `src/runtime/server/utils/markdown-request.ts`; `negotiation-decision.ts`; `negotiation-response.ts`; `content-negotiation.ts` |
| F-07 | Observed | Implementation | mdream uses filter.exclude. ignoreElements, ignoreSelectors, and preserveCodeBlocks are not supported options. options.origin contains the origin, not a route path. | `node_modules/mdream/dist/index.d.mts:62`; `src/runtime/server/utils.ts:77` |
| F-08 | Observed | Implementation | Runtime llms.txt combines stored pages and sitemap URLs. Sitemap exclusion does not remove a stored page. Runtime llms-full streams stored content. | `src/runtime/llms-txt-utils.ts:250`; `src/runtime/server/routes/llms-full.txt.get.ts` |
| F-09 | Observed | Implementation | Prerender hooks write SQLite page records; empty Markdown omits full-export content but does not remove the record. Sitemap-only crawl entries skip the static full export. | `src/prerender.ts:264`, `src/prerender.ts:364`, `src/prerender.ts:682` |
| F-10 | Documented | Primary proposal | llms.txt is a proposal. Its format specifies an H1, optional summary/preamble, and H2 link lists. llms-full is not defined by it. | https://llmstxt.org/ ; current v2 updated 2026-08-10 |
| F-11 | Documented | Primary standard | RFC 9727 defines API discovery and application/linkset+json. It recommends the RFC profile. | https://www.rfc-editor.org/rfc/rfc9727.html ; June 2025 |
| F-12 | Observed | Implementation | Config maps camelCase catalog fields to relation tokens, resolves URLs, and generates MCP entries only with server Toolkit and a site URL. apiCatalog:false disables catalog output. | `src/utils/api-catalog.ts`; `src/module.ts:584`; `src/runtime/server/routes/api-catalog.ts` |
| F-13 | Documented | Primary draft | Agent Skills Discovery draft 0.2.0 requires schema URI, artifact type, URL, digest, and identity fields. SHA-256 covers artifact bytes. | https://github.com/cloudflare/agent-skills-discovery-rfc ; updated 2026-03-12 |
| F-14 | Documented | Primary specification | Skill name matches its parent directory; SKILL.md has name and description frontmatter. | https://agentskills.io/specification |
| F-15 | Observed | Implementation | Local discovery is project-root constrained; entries preserve file bytes and calculate digests. External artifacts are validated but not fetched. Hook digest must be 64 hexadecimal characters. | `src/utils/agent-skills.ts:186`, `:269`, `:364`, `:432`; `src/module.ts:168` |
| F-16 | Observed | Implementation | i18n auto-detection can be disabled. Page fallback uses discovered Nuxt paths when the default locale is omitted. Error response headers suppress locale alternates. | `src/utils/i18n.ts:49`; `src/runtime/server/plugins/link-header.ts`; `src/runtime/server/utils/negotiation-response.ts:47` |
| F-17 | Observed | Implementation | SQLite tokenizer defaults to trigram when a configured locale is CJK, unless configured otherwise. Postgres does not use FTS5. | `src/utils/i18n.ts:17`; `src/module.ts`; `src/runtime/server/db/drizzle/queries.ts:455` |
| F-18 | Documented | Primary documentation | Custom i18n routes can come from config. WebMCP is experimental; Chrome documents an origin trial and local flag. | https://i18n.nuxtjs.org/docs/guide/custom-paths ; https://developer.chrome.com/docs/ai/webmcp |
| F-19 | Observed | Implementation | WebMCP composables register while mounted/active/enabled; unsupported clients skip. Built-ins use public indexed data; this is not an access-control check against sitemap visibility. | `src/runtime/app/composables/webmcp.ts`; `src/runtime/app/plugins/webmcp.client.ts`; `src/runtime/server/routes/__ai-ready/pages.get.ts` |
| F-20 | Documented | Primary documentation | readOnlyHint belongs on tools that do not change state. exposedTo grants cross-origin embedding access, not remote server access. Character budgets are recommendations. | https://developer.chrome.com/docs/ai/webmcp/secure-tools ; updated 2026-09-01 |
| F-21 | Observed | Implementation | Built-in output budget defaults to 1500 characters. Shared and per-tool attachment options flow to registration. | `src/runtime/webmcp.ts:165`; `src/runtime/webmcp-site-tools.ts`; `src/runtime/app/plugins/webmcp.client.ts` |

Withdrawn assertions: generic AI citation guarantees; increasing platform compliance with Content Signals; visits cause indexing; static SSG hosts MCP; sitemap exclusions remove all stored content; every response includes hreflang; unsupported mdream options.
Limitations: contentsignals.org yielded no extractable body, so protocol labels rely on installed module output plus the linked specification. No client adoption claim will remain.

## Page briefs

### Introduction

- File: `docs/content/1.getting-started/0.introduction.md`.
- Route: `/docs/ai-ready/getting-started/introduction`. Navigation: Introduction.
- Question: what does this module produce, and what do I enable first?
- Outcome: distinguish generated Markdown/context files from optional server tools and signal declarations.
- Evidence: F-01, F-02, F-04, F-10.
- Corrections: remove citation/adoption guarantees and “best practice defaults”; call llms.txt a proposal; constrain “all pages.”
- Outline: current Why heading with concrete purpose; existing feature headings with prerequisites; installation link.
- Example: no executable code. Check feature claims against registered handlers and defaults.
- Visuals: none required. Coordinator checks card links and feature headings.
- State: draft ready, independent article review pending.

### Installation

- File: `docs/content/1.getting-started/1.installation.md`.
- Route: `/docs/ai-ready/getting-started/installation`. Navigation: Installation.
- Question: how do I install and verify the features for my rendering mode?
- Outcome: install module, verify Markdown, prerender content, and choose server features when needed.
- Evidence: F-01 through F-04, F-08.
- Corrections: fix malformed shell command `[pnpm](...)`; remove “zero-config” and false signals check; require prerender for build artifacts.
- Correct the rendering matrix: static artifacts versus server tools, explicit runtime indexing, runtime full export when indexed.
- Scope Node guidance to versions supported by Nuxt. Do not imply all Vercel deployments have Neon configured.
- Outline: setup and runtime requirement; concrete verification; optional MCP linking to its dedicated guide; rendering support; short next steps.
- Example checks: parse config/JSON fences; check commands and table against installation and handler code. No external client connection.
- Visuals: coordinator checks ModuleInstall rendering and matrix on mobile.
- State: draft ready, independent article review pending.

### Content Signals

- File: `docs/content/2.guides/0.content-signals.md`.
- Route: `/docs/ai-ready/guides/content-signals`.
- Question: how do I publish AI usage preferences in robots.txt?
- Outcome: configure preferences without implying enforcement.
- Evidence: F-04, F-05.
- Corrections: remove platform compliance claim; update Robots prerequisite; qualify robots sample as added directive lines, not complete file.
- Clarify omitted fields resolve false and contentUsage:false belongs inside contentSignal.
- Outline: purpose/limits; configuration before protocol detail where headings allow; selective permissions.
- Example checks: capture config and compare generated group values with module branch; parse examples.
- Visuals: none needed. No crawler acceptance claim.
- State: draft ready, independent article review pending.

### Markdown

- File: `docs/content/2.guides/1.markdown.md`.
- Route: `/docs/ai-ready/guides/markdown`.
- Question: how do I serve Markdown and customize conversion safely?
- Outcome: request an explicit Markdown URL, understand negotiated redirects, and configure supported filters/hooks.
- Evidence: F-06, F-07, source-content branch in `src/runtime/server/middleware/markdown.ts`.
- Corrections: replace obsolete negotiation truth table; use curl -L for redirect example; fix impossible origin-path guard.
- Replace unsupported ignoreElements with filter.exclude. Replace unsafe hand-built YAML with a simple Markdown append example.
- Qualify source Markdown as serialized content AST rather than original byte preservation.
- Outline: one working request before internals; retain Build-Time/Runtime/Cache Safety/Content/Configuration/Hooks headings.
- Example checks: execute extracted mdream option hook using installed htmlToMarkdown and synthetic HTML. Verify excluded text disappears and main content remains.
- Visuals: coordinator checks long cache example and source-content sample.
- State: draft ready, independent article review pending.

### llms.txt

- File: `docs/content/2.guides/2.llms-txt.md`.
- Route: `/docs/ai-ready/guides/llms-txt`.
- Question: what enters each generated file, and how do I customize it?
- Outcome: add sections, choose canonical/Markdown links, understand prerender versus runtime data.
- Evidence: F-07 through F-10.
- Corrections: runtime llms-full reads DB; dev llms.txt can list sitemap data; sitemap exclusion does not remove stored pages.
- Replace invalid mdream options with filter.exclude. Remove unsafe interpolated YAML and duplicate H1 examples.
- Keep empty-Markdown example scoped to omitting static full-export content, not hiding a page from indexes.
- Outline: file purpose and basic config; runtime/full export; retain discovery phase headings with current hook triggers; customization; sitemap/dev limits.
- Example checks: extract and run formatter/config hooks with fixtures; execute conversion filter against installed mdream; verify first H1 not doubled.
- Visuals: coordinator reviews generated-output blocks and internal fragments.
- State: draft ready, independent article review pending.

### API Catalog

- File: `docs/content/2.guides/10.api-catalog.md`.
- Route: `/docs/ai-ready/guides/api-catalog`.
- Question: how do I advertise my API endpoint and its documentation?
- Outcome: a catalog entry with valid public endpoint/document relations and correct base handling.
- Evidence: F-11, F-12.
- Corrections: generated MCP catalog requires site URL; apiCatalog:false disables the catalog, not merely generated entry.
- Prefer smallest working public API example before additional relations. Preserve relation table and baseURL semantics.
- Example checks: run extracted config through resolveApiCatalogConfig; assert relation targets and base-aware URL values.
- Visuals: coordinator checks table and config block.
- State: draft ready, independent article review pending.

### Agent Skills

- File: `docs/content/2.guides/11.agent-skills.md`.
- Route: `/docs/ai-ready/guides/agent-skills`.
- Question: how do I publish a valid skill and advertise its artifact?
- Outcome: minimal SKILL.md and discoverable index, with later external/archive options.
- Evidence: F-13 through F-15.
- Corrections: hook's sha256 ellipsis fails validation; use a clearly synthetic valid-length digest and instruction to replace it.
- Move complete valid SKILL.md example beside first discovery directory example. Name discovery version as a draft.
- Clarify local discovery publishes SKILL.md only; package supporting resources in an external archive when needed.
- Outline: convention and valid skill; config/hook; explicit local entries; aliases; external archives.
- Example checks: run extracted local config and SKILL.md through resolver in scratch; validate index digest and aliases; reject mismatched digest format.
- Visuals: coordinator checks directory tree and address table. No third-party artifact download.
- State: draft ready, independent article review pending.

### i18n

- File: `docs/content/2.guides/8.i18n.md`.
- Route: `/docs/ai-ready/guides/i18n`.
- Question: how do locale routes appear in Markdown and llms.txt?
- Outcome: supported locale config, correct translated routes, output expectations scoped by response status.
- Evidence: F-16 through F-18; `src/runtime/llms-txt-i18n.ts` and `src/runtime/i18n-url.ts`.
- Corrections: remove vague “every layer” and unverified Anthropic attribution; exclude errors from universal header claims.
- Omitted-locale fallback can use Nuxt page paths; do not claim it always disappears without explicit default-locale path.
- Scope FTS5 tokenizer to SQLite and default behavior. Mark counts/timestamps as illustrative.
- Check full response example against current Link builder, including Vary inputs and absolute URLs.
- Outline: common auto-detection; table; strategies/custom paths; examples; advanced disabling/compatibility.
- Example checks: existing exported i18n URL functions with translated path fixtures and omitted defaults; output shapes from handler/builder.
- Visuals: coordinator checks table and header block.
- State: draft ready, independent article review pending.

### WebMCP

- File: `docs/content/2.guides/9.webmcp.md`.
- Route: `/docs/ai-ready/guides/webmcp`.
- Question: how do I expose built-in or component tools in a supporting browser?
- Outcome: enable tool registration and expose only intended data/actions.
- Evidence: F-18 through F-21.
- Corrections: remove readOnlyHint from UI-changing filter example; keep annotations consistent with behavior.
- Replace assertion that public pages endpoint verifies prior publication with precise indexed-data wording.
- Explain exposedTo cross-origin embedding scope; avoid claiming it is a server authorization mechanism.
- Keep experimental status; link current browser setup rather than promise broad support.
- Outline: built-ins; component tool; lifecycle details; customization; security/output budgets; testing.
- Example checks: parse SFC script and config hooks; registration/handler behavior through installed Vue and exported WebMCP APIs where feasible.
- Visuals: coordinator checks long composable and security examples. No model choice or real browser API guarantee.
- State: draft ready, independent article review pending.

## Verification and writing record

Root approved the nine researched briefs before drafting. All nine article drafts are now ready for independent review.
After factual changes, apply surface and structural humanize passes separately to every page.
Record representative before/after phrases, intentional meaning changes, exact commands, and evidence limits here.
Preserve public identifiers, routes, and existing fragment headings. Root owns final link/render checks and independent article review.


## Factual review before humanize passes

The writer compared the first factual draft with each evidence row before the final wording passes.
The coordinator supplied two cross-page corrections, both checked against implementation:

- `batchIndex.ts` selects pending rows. Existing page updates need a manual reindex trigger.
- `indexPage.ts` omits conversion hooks. Nitro mdreamConfig/page:markdown hooks apply to runtime HTML conversion, not manual indexing or content-source responses.

The updated guides preserve all existing section headings. No page routes or date metadata changed.
The old JSONL build flow now describes SQLite storage in Markdown and llms.txt guides.

## Humanize pass 1: surface

Applied separately after factual corrections to all nine pages:

| Page | Before | After |
| --- | --- | --- |
| Introduction | “minimal config and best practice defaults” | Concrete Markdown, context files, and optional MCP behavior |
| Installation | “Zero-config module” and “You've successfully installed” | Explicit verification commands and rendering prerequisites |
| Content Signals | “Major AI platforms increasingly respect them” | Preferences rely on the receiving system; no adoption claim |
| Markdown | “smart bot detection” and “HTML→mdream round-trip” | Named request headers and content-source serialization |
| llms.txt | “two-phase approach combining” | Prerendering first, sitemap routes afterward |
| API Catalog | “Nuxt AI Ready then” | “With this configuration, the module” |
| Agent Skills | “That is the whole setup” | Complete valid skill file beside the directory example |
| i18n | “threads it through every layer” | Locale links and Markdown metadata |
| WebMCP | “instead of guessing at the DOM” | Functions define the actions an agent can request |

Removed hyphens used as prose dashes. Kept hyphens inside required public identifiers.
Removed unused or misleading code comments while keeping the protocol-specific replay mapping comment.

## Humanize pass 2: structure

Applied after the surface pass, with the claims rechecked afterward:

| Page | Structural change |
| --- | --- |
| Introduction | Leads with produced artifacts and setup path, then separates feature prerequisites. |
| Installation | Starts with installation and a concrete request. Client-specific setup moves to the MCP guide. |
| Content Signals | Explains the effect and limits directly; lists directive formats without adoption claims. |
| Markdown | Opens with one curl request. Keeps cache and source-content details after the common path. |
| llms.txt | Distinguishes index from full export first. Removes the obsolete implementation diagram and repeated H1 example. |
| API Catalog | Keeps one configured API example before the relation reference. Splits baseURL behavior into short sentences. |
| Agent Skills | Shows a valid SKILL.md before advanced options. Replaces the fake digest hook with filtering existing entries. |
| i18n | Starts with locale configuration. Narrows error, tokenizer, and omitted-route behavior beside each affected example. |
| WebMCP | Keeps built-in tools first and component lifecycle later. Puts cross-origin scope beside permission configuration. |

Intentional meaning changes: false installation/indexing guarantees were corrected; unsupported options were replaced; security boundaries were narrowed.
No rewritten passage introduces measured adoption, client success, traffic, crawler compliance, or live service acceptance.

## Replay evidence

Run from the repository root:

```bash
node editorial/docs/verify-fundamentals.mjs 3a01b0fcac5944641cfd2a0ac3e5688d9d820078
node editorial/docs/verify-fundamentals.mjs
```

The base-fence replay fails because the old Markdown filter leaves “Remove this.” in converted output.
This comparison ran after drafting. It demonstrates the old defect; it is not claimed as a test-first source-code repair.
The current replay passes: 36 TypeScript examples parse; both conversion filters remove selected content and retain the article.
It also verifies catalog URL resolution, skill bytes and digest, skill filtering, a WebMCP handler result, i18n links, and llms.txt formatting.
The skill digest uses real fixture bytes, not a fabricated hash. The temporary fixture is removed afterward.

The i18n replay maps the virtual module to the installed shared runtime, matching the configured module branch.
It does not build Nitro or exercise browser registration. Vue registration is a captured boundary in the component example.
The header check verifies the actual Link builder. Request lifecycle and status handling remain implementation evidence.
All JSON/TypeScript checks are syntax or isolated behavior checks, not full application typechecking.

Focused ESLint passed for all nine article paths and the replay helper. `git diff --check` passed.
No repository-wide tests, server build, browser session, or external submission ran in this writer task.

## Per-page validation

| Page | Writer checks | Remaining review |
| --- | --- | --- |
| Introduction | Module defaults and registered handlers traced; feature/metadata wording checked | Independent prose and rendered review |
| Installation | Shell text corrected; config syntax; runtime/SSG table traced to module and handlers | Real installation/client connection not run |
| Content Signals | Config syntax; booleans and minimum dependency traced to module | No crawler compliance test |
| Markdown | Current extracted filters pass; base filter fails; hook boundary traced | HTTP/browser negotiation renderer owned by coordinator |
| llms.txt | Formatter output and filter replay; SQLite/runtime handlers traced | Full build/export integration not rerun |
| API Catalog | Extracted config produces expected base-aware endpoint and description URLs | Deployed catalog endpoint not called |
| Agent Skills | Local bytes/digest and hook filter replay; real sha256 command documented | External upload and discovery client not run |
| i18n | Actual Link builder produces canonical and locale URLs; fallback implementation inspected | Full localized app rendering not run |
| WebMCP | SFC script parses; captured handler returns expected result; lifecycle implementation traced | Browser registration and agent selection not run |


## Independent article review corrections, 2026-09-15

The independent reviewer identified two P2 scope errors after writer commit `5eac4f0`.
Both were corrected in prose without changing runtime source.

| ID | Status | Kind | Corrected claim | Evidence |
| --- | --- | --- | --- | --- |
| F-22 | Observed | Implementation | Only runtime HTML conversion injects locale frontmatter. Content-source and prerendered responses need their own locale metadata. | `src/runtime/server/middleware/markdown.ts:85`, `:104`, `:196`; prerender middleware additionalFrontmatter |
| F-23 | Observed | Implementation | Server WebMCP search uses database full-text search. Static fallback matches metadata, not Markdown bodies; fallback also runs after empty server results. | `src/runtime/webmcp-site-tools.ts:63`, `:132`, `:349` |

Updated the i18n surface table, frontmatter example, introduction, and behavior note together.
Updated the WebMCP tool table and added the server-versus-static distinction beside it.
Surface pass: removed the universal “Markdown bodies include” and “Full-text search across page content” claims.
Structural pass: put each qualification beside the table and example it changes.
Factual recheck traced the early content-source returns and the metadata-only search weights.
Focused ESLint passed on both articles. Independent re-review remains pending.
