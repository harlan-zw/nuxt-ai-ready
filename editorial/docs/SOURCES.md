# Sources

Scope: all 20 Markdown pages under docs/content. Checked 2026-09-15.
This extends the [IndexNow pilot](../indexnow/BRIEF.md), which retains its source and example evidence.

## Evidence policy

Read primary sources before changing technical claims. Existing prose is a lead, not proof.
Use current source code for module behavior and defaults. Trace callers as well as types.
Use official protocol references for wire fields and external guarantees.
Record checked URLs, local paths, date, version, and limitations in the page brief.
Do not claim measured demand, indexing speed, ranking improvements, or broad client support without direct evidence.
No paid research is authorized or needed for this technical refresh. Search demand remains unmeasured.

| Authority | Entry | Scope | Limits |
| --- | --- | --- | --- |
| Module source | `src/module.ts`, `src/runtime/types.ts`, `src/types.ts` | Defaults, hooks, types, dependencies | Current branch; inspect implementation before treating comments as guarantees |
| Module runtime | `src/runtime/server/`, `src/cli.ts`, `src/prerender.ts` | Runtime, CLI, build output | Local behavior, no external service acceptance |
| Nuxt | https://nuxt.com/docs/4.x/ | Config, server conventions | Check exact current page; do not import Nuxt 3 assumptions |
| Nuxt SEO | https://nuxtseo.com/docs/ | Companion modules | Check relevant installed source when public docs disagree |
| MCP | https://modelcontextprotocol.io/specification/ | Protocol details | Version and client support are separate |
| IETF | https://www.rfc-editor.org/rfc/rfc9727.html | API catalog | Protocol, not client adoption |
| llms.txt | https://llmstxt.org/ | File proposal | Proposal does not prove crawler adoption |
| Cloudflare | https://developers.cloudflare.com/ | Deployment and bindings | Check preset/version; no account-specific assumption |
| IndexNow | [Pilot sources](../indexnow/SOURCES.md) | Changed URL recipe | No live submission |

Additional primary sources may enter through a reviewed page brief. Record exact URLs, not search result URLs.
Preserve the v1 release page's historical time scope. Verify historical claims against tags, commits, or release PRs.

## Publication boundary

The site's remote collection includes `docs/content/**/*.md`.
Its local collection uses `docs/content` as cwd and `**/*.md` as include.
Therefore `editorial/` is outside source ingestion, navigation, search, and sitemap generation.
Evidence: `nuxtseo.com/apps/site/content.config.ts`, `getSubModuleCollection`, inspected 2026-09-15.
Only article files belong under docs/content. Keep briefs, checks, and raw sources in editorial or scratch.
