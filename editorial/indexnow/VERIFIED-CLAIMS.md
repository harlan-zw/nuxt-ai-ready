# Verified claims

| ID | Status | Evidence kind | Claim | Scope | Evidence | Checked | Version |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IN-01 | Documented | Official documentation | Submit recent additions, updates, and deletions | Caller supplies changed URLs | https://www.indexnow.org/faq | 2026-09-15 | Current page |
| IN-02 | Documented | Official documentation | POST accepts up to 10,000 URLs | Same host; custom key file uses keyLocation | https://www.indexnow.org/documentation | 2026-09-15 | Current page |
| IN-03 | Documented | Official documentation | 200 confirms receipt; 202 awaits key validation | Neither guarantees indexing | https://www.indexnow.org/documentation and https://www.indexnow.org/faq | 2026-09-15 | Current pages |
| IN-04 | Documented | Official documentation | 429 requires a later retry | Honor Retry-After when provided | https://www.indexnow.org/faq | 2026-09-15 | Current page |
| IN-05 | Observed | Implementation inspection | AI Ready has no IndexNow submission implementation | Only legacy table cleanup remains in src | `rg -n -i indexnow src`; removal PR https://github.com/harlan-zw/nuxt-ai-ready/pull/78 | 2026-09-15 | 2.3.3 |
| IN-06 | Observed | Implementation inspection | Site config provides getSiteConfig as a server auto-import | Original recipe used a request event; current helper uses explicit configuration | `src/module.ts`; installed `nuxt-site-config/dist/module.mjs` | 2026-09-15 | nuxt-site-config 4.2.3 |
| IN-07 | Unresolved | Live integration | IndexNow accepts a real deployed request from this example | No owned verification key or live submission used | Offline example checks only | 2026-09-15 | Not tested |
| IN-08 | Observed | Implementation inspection | contentChanged compares the converted Markdown hash with stored state | First indexing qualifies; hook runs after hash storage; no deletion event | `src/runtime/server/utils/indexPage.ts:82`; `src/runtime/types.ts:590` | 2026-09-15 | Current branch |
