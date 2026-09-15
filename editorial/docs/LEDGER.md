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
| IndexNow | Advanced IndexNow recipe | article reviewed | Pilot PR121 |
| Fundamentals | 9 files | brief reviewed; drafting | Assigned writer |
| Runtime and reference | 10 files | brief reviewed; drafting | Assigned writer |

## Delivery

Refresh branch builds on the IndexNow pilot. The site redirect must deploy with the moved article.
Keep the historical v1 page historical. Do not interpret removed v1 features as current defects.

## Independent brief review

Root approved both group briefs on 2026-09-15. A separate reviewer traced cross-page behavior.
Required corrections: TTL does not queue existing indexed pages; HTTP conversion hooks do not run during indexPage conversion.
The config reference also needs active prerender.concurrency and debugCron options. Writers accepted these additions.
Root added the reindex prerequisite to IndexNow so all20 pages share the same runtime model.
