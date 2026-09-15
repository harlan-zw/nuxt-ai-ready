# Docs refresh ledger

Scope: all 20 files under docs/content. No new pages or URL moves beyond the IndexNow pilot.
Excluded: README, changelog, security policy, runtime source changes, and unpublished editorial policy rewrites unrelated to this task.
New article candidates: none. Search demand: not measured. Publication: owned-repository PRs authorized, merge not requested.

Every group brief links [Sources](SOURCES.md), [Claims](VERIFIED-CLAIMS.md), [Copy](COPY.md), and [Screenshots](SCREENSHOTS.md).
Each page records its route, question, sources, planned corrections, example checks, humanize changes, and review state.
Research comes before prose. Root independently reviews each brief before its writer starts.
An independent reviewer checks final revisions; writers cannot approve their own work.

| Group | Files | State | Owner |
| --- | --- | --- | --- |
| IndexNow | Advanced IndexNow recipe | article reviewed; browser checks passed | Pilot PR121 |
| Fundamentals | 9 files | article reviewed; browser checks passed | Assigned writer |
| Runtime and reference | 10 files | article reviewed; browser checks passed | Assigned writer |

## Delivery

Refresh branch builds on the IndexNow pilot. The site redirect must deploy with the moved article.
Keep the historical v1 page historical. Do not interpret removed v1 features as current defects.

## Independent brief review

Root approved both group briefs on 2026-09-15. A separate reviewer traced cross-page behavior.
Required corrections: TTL does not queue existing indexed pages; HTTP conversion hooks do not run during indexPage conversion.
The config reference also needs active prerender.concurrency and debugCron options. Writers accepted these additions.
Root added the reindex prerequisite to IndexNow so all20 pages share the same runtime model.

## Final collection checks

Checked 2026-09-15 in the real site renderer, using this branch as the local content source.
All 20 routes rendered at desktop and mobile widths. Titles, descriptions, and canonical URLs matched frontmatter.
All collection links and section fragments resolved. Other site destinations returned HTTP 200.
Client navigation from llms.txt to the Nuxt hook section passed. The old IndexNow route returned 301 to Advanced.
Mobile pages had no document overflow or missing images. Desktop and mobile screenshots use two captured pixels per CSS pixel.
The site retains its existing commit-metadata placeholder and crowded mobile module selector. Article content remains readable.

Independent review approved the article revision 33d33e2. Later changes only corrected three rendered section fragments.
The reviewer resolved unsupported filtering, locale scope, obsolete storage output, and prerender trigger claims.
The final PR review covers the final commit and those fragment corrections.

Replay checks pass: fundamentals examples, runtime/reference examples, and the changed-only IndexNow helper.
The runtime hook replay converts real HTML and preserves existing filter exclusions.
External service acceptance, authenticated deployments, and paid vector operations remain untested.
The refresh adds no downloadable example artifacts. Fenced examples are the checked copyable instructions.

Publication remains pending. Merge and deploy the content with the companion site redirect.
Editorial files remain outside docs/content. The site's collection glob excludes them from navigation, search, and sitemap ingestion.

## Page completion

| Route | Copy and claims | Rendered |
| --- | --- | --- |
| `/docs/ai-ready/getting-started/introduction` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/getting-started/installation` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/content-signals` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/markdown` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/api-catalog` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/agent-skills` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/llms-txt` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/mcp` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/runtime-indexing` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/cloudflare` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/cli` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/i18n` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/guides/webmcp` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/advanced/rag-example` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/advanced/indexnow` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/api/nuxt-hooks` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/api/config` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/nitro-api/composables` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/nitro-api/nitro-hooks` | Both humanize passes; independent review | Desktop and mobile passed |
| `/docs/ai-ready/releases/v1` | Both humanize passes; independent review | Desktop and mobile passed |
