# Runtime indexing and the page database

Read this when pages change between deployments, or when server code queries stored pages.
If each deployment prerenders all content, you do not need runtime sync.

## When the database is on

The database stays off until a feature needs it: `runtimeSync`, `cron`, MCP page tools, WebMCP page tools, or an explicit `database` config.
Every driver needs the optional `drizzle-orm` peer. Install it with `npx nypm add drizzle-orm@1.0.0-rc.4`. Without it, the build fails and names the feature.
Prerendering always writes a temporary SQLite index and a dump at `/__ai-ready/pages.dump`.

Driver selection. The Install column lists what the driver needs in addition to `drizzle-orm`. Each package is an optional peer, so the app installs it:

| Platform | Driver | Install |
|----------|--------|---------|
| Node.js | `node:sqlite` | nothing |
| Bun | `bun:sqlite` | nothing |
| Cloudflare preset | D1 | a binding |
| Vercel with `POSTGRES_URL` | Neon | `@neondatabase/serverless` |
| `database: { type: 'libsql' }` | LibSQL | `@libsql/client` |
| `database: { type: 'postgres' }` | PostgreSQL | `postgres` |

The build machine always uses SQLite, also for a D1 deployment.
For D1, set `database: { type: 'd1', bindingName: 'AI_READY_DB' }` and create the binding yourself. The default binding name is `DB`.

## Runtime sync

```ts
export default defineNuxtConfig({
  aiReady: {
    runtimeSync: { ttl: 3600, batchSize: 50, pruneTtl: 0 },
    cron: true, // every 5 minutes, also enables runtimeSync
  },
})
```

Set `NUXT_APP_SECRET` in production to a string with at least 32 characters.
AI Ready and OG Image derive separate tokens from this shared Nuxt root secret.
Run `pnpm exec nuxt-ai-ready token` with the root secret in your environment to obtain the runtime sync bearer token.
Cloudflare can supply the root through its encrypted `NUXT_APP_SECRET` binding at runtime.
The legacy `runtimeSyncSecret` option and `NUXT_AI_READY_RUNTIME_SYNC_SECRET` remain supported with a deprecation warning.
They use the original bearer token unchanged when `appSecret` is unset or empty.
A non-empty application secret takes precedence. An invalid application secret fails without using the legacy token.
Without a root or legacy token, protected requests return `500`.

Every control endpoint needs `Authorization: Bearer <secret>`, including `GET /__ai-ready/status`. Only `POST /__ai-ready/prune?dry=true` works without it.

| Request | Effect |
|---------|--------|
| `POST /__ai-ready/poll` | Index at most 50 pending pages. Repeat while `remaining > 0`. |
| `POST /__ai-ready/reindex?route=/about` | Index one route now. The route does not need to be in the sitemap. |
| `POST /__ai-ready/restore` | Replace stored pages with the build dump. |
| `POST /__ai-ready/prune?ttl=604800` | Delete routes missing from the sitemap for that long. |
| `GET /__ai-ready/cron` | Production only. For hosts without native cron. |

Traps:

- **TTL expiry does not reindex a page.** Poll and cron process only pending rows. After a CMS edit, call `reindex` for that route.
- **Only prerendered pages are in the dump.** Each server process loads the dump before its first database query. A page that was not prerendered stays out of the index until poll, cron, or `reindex` adds it.
- **Cloudflare Pages has no cron triggers.** Keep `cron: true` and call `GET /__ai-ready/cron` from an external scheduler. On Workers the module adds the trigger.

## Server query helpers

`queryPages`, `searchPages`, `countPages`, `streamPages`, `indexPage`, and `indexPageByRoute` are auto-imported in Nitro code. Other exports need `import { ... } from '#ai-ready/server'`.

```ts
// server/api/search.get.ts
export default defineEventHandler(async (event) => {
  const q = getQuery(event).q
  if (typeof q !== 'string' || !q.trim())
    return []
  return searchPages(event, q, { limit: 10 })
})
```

- `searchPages` returns `[]` in dev and during prerender. On SQLite and D1, `score` is BM25 and lower ranks first. PostgreSQL returns `score: 0`.
- `queryPages(event, { route })` returns one page or `undefined`. Without `route` it returns an array. Add `includeMarkdown: true` for the body.
- Raw SQL: `useRawDb` from `#ai-ready/server`. `useDatabase` does not exist.
- The event goes in a different position: `indexPage(route, html, options, event)` and `indexPageByRoute(route, event, options)`.
- `indexPage` throws on failure. `indexPageByRoute` returns `{ success: false, error }`.

React to a changed page with the `ai-ready:page:indexed` Nitro hook. Check `ctx.contentChanged`; a forced reindex of the same content still fires the hook.
