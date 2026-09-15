# IndexNow recipe brief

Records: [Sources](SOURCES.md), [Claims](VERIFIED-CLAIMS.md), [Copy](COPY.md), [Screenshots](SCREENSHOTS.md).

- Included file: `docs/content/3.advanced/1.indexnow.md`.
- Excluded: every other article, runtime implementation, automated change discovery, live submissions.
- New article candidates: none.
- Reader question: how do I submit only changed pages during runtime indexing?
- Outcome: configure a key, expose its file, and call a server utility only when the runtime hook reports contentChanged.
- Current route: `/docs/ai-ready/guides/indexnow`.
- Destination: `/docs/ai-ready/advanced/indexnow`, Advanced navigation, label IndexNow.
- Redirect dependency: deploy the companion site redirect with the moved page in the same site release.
- Claims: IN-01 through IN-06 and IN-08. IN-07 remains untested.
- Search evidence: none measured; scope follows the user's question.
- Parent commit: `e329f1d`.
- Contribution: a Nuxt server recipe with an explicit changed URL list and key route.
- Outline: changed URLs, key setup, key route, submission utility, contentChanged hook, static sites, responses.
- Related links: IndexNow overview, installation, runtime indexing.
- Example: fenced TypeScript in the article, Nuxt 4, H3 1.15.11, nuxt-site-config 4.2.3.
- Checks: execute extracted utility with a captured fetch boundary; check no-op, payload, rejection, and error propagation.
- Browser: desktop and mobile article review; no publication figures planned.
- Publication authority: owned-repository PRs authorized. No merge or deployment instruction given.

## Brief review

Independent reviewer: indexnow_review. Requested source and code review before prose changes.
Findings: distinguish 200/202; explain changed URL caller; honor Retry-After; clarify deleted URL timing.
Response: accept these corrections. Keep the existing helper and avoid introducing change detection infrastructure.
Context-free jobs need their own configuration; preserve errors from the helper and explain retry ownership.
State: brief reviewed. Independent reviewer approved the contentChanged hook approach.

## Ledger

| Article | Owner | State | PR | Publication |
| --- | --- | --- | --- | --- |
| IndexNow | Coordinator | article reviewed | https://github.com/harlan-zw/nuxt-ai-ready/pull/121 | Original page remains live |

## Revised scope and checks

The user required changed-only behavior in code. The reviewer approved the existing contentChanged hook flag.
The helper receives explicit key and siteUrl because the hook has no request event.
Only converted Markdown changes qualify. Deleted pages and prerender-only changes require the publishing system.
Hash storage precedes the hook. Failed submissions need a direct retry or a persistent job.

The first executable check failed with an unchanged URL submitted from an unguarded hook.
Adding the contentChanged guard made that check pass.
Replay: `node editorial/indexnow/verify-example.mjs`. It extracts the article examples and records the fetch boundary.
This proves local behavior only. It does not prove deployed key verification or IndexNow acceptance.

Humanize pass 1: replaced ambiguous “URLs are live” with explicit runtime prerequisites.
Humanize pass 2: moved changed-content behavior before setup; kept retries and static hosting after the main path.
Meaning changed intentionally: the example now subscribes to runtime content changes instead of submitting a fixed list.

## Article review

Independent reviewer indexnow_review ran the extracted examples successfully.
Corrected the key-verification wording for 202 responses and reconciled stale scope in these records.
Local browser checks passed. Production publication remains pending.

## Rendered review, 2026-09-15

The site ran at http://127.0.0.1:3199 with this worktree as its temporary ai-ready source.
The site operator reverted that source override after inspection.
Desktop 1440x1000 and mobile 390x844: readable article, no document overflow, bounded code blocks.
One H1, the revised description, and https://nuxtseo.com/docs/ai-ready/advanced/indexnow canonical were present.
Navigation showed IndexNow under Advanced. Client navigation from RAG Setup reached the destination heading.
The manual indexing link reached its actual heading and fragment.
The old guide returned 301 and the browser reached the rendered destination.
No article figures or downloads were added. No live IndexNow request was sent.
Temporary captures: ~/scratch/indexnow-refresh/. Browser page indexnow-refresh was closed.
The deployed source still uses the old route. Publish content and route rules together.
