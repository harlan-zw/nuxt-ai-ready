# Sources

Scope: the IndexNow recipe only. Checked 2026-09-15.

| Authority | Exact source | Use | Limits |
| --- | --- | --- | --- |
| IndexNow | https://www.indexnow.org/documentation | Request format, key location, batch limit, response codes | Receipt does not prove indexing |
| IndexNow | https://www.indexnow.org/faq | Changed URLs, deletion, retry handling | Provider documentation, no measured results |
| Nuxt | https://nuxt.com/docs/4.x/guide/going-further/runtime-config | Environment overrides and server configuration | Nuxt 4 |
| Local implementation | `src/module.ts`, installed `nuxt-site-config` | Site configuration dependency and server auto-import | Installed versions only |

Use those documentation paths for further discovery. Prefer protocol documentation for payload fields.
No keyword research or paid queries: this is an existing reader-requested recipe correction.
No search demand, traffic, or indexing speed claims.

The site collection includes only `docs/content/**/*.md` remotely.
Local sources use `docs/content` as their root with `**/*.md`.
`editorial/` lies outside both boundaries, so its files cannot enter that collection's navigation, search, or sitemap.
Inspected: `nuxtseo.com/apps/site/content.config.ts`, `getSubModuleCollection`, 2026-09-15.
