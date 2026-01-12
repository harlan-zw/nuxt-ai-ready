# IndexNow Implementation Plan

IndexNow is a protocol for instantly notifying search engines (Bing, Yandex, Naver, Seznam) when URLs change, enabling faster indexing than waiting for crawlers.

## Overview

Integration points with existing architecture:
- **Content hash** (`content_hash` column) detects actual content changes
- **New `indexnow_synced_at` column** tracks when each page was last synced
- **DB query** finds pages where content changed since last sync
- **Explicit endpoint** triggers sync (no global state, serverless-safe)

## Database Schema Change

Add column to track IndexNow sync status:

```sql
-- v1.6.0
ALTER TABLE ai_ready_pages ADD COLUMN indexnow_synced_at INTEGER;
```

A page needs IndexNow sync when:
- `indexed = 1` (has content)
- `is_error = 0` (not an error page)
- `indexnow_synced_at IS NULL` OR `indexnow_synced_at < indexed_at` (content changed since last sync)

## Configuration

```typescript
// nuxt.config.ts
aiReady: {
  indexNow: {
    enabled: true,
    key: process.env.INDEXNOW_KEY,     // Required: your IndexNow API key
    host: 'api.indexnow.org',          // Optional: search engine endpoint
  }
}
```

## Files to Create/Modify

### 1. Schema Update

**`src/runtime/server/db/schema-sql.ts`**

```typescript
export const SCHEMA_VERSION = 'v1.6.0'

export const PAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ai_ready_pages (
  -- ... existing columns ...
  indexnow_synced_at INTEGER  -- timestamp of last IndexNow submission
)`
```

### 2. Query Functions

**`src/runtime/server/db/queries.ts`**

```typescript
/**
 * Get pages needing IndexNow sync (content changed since last sync)
 */
export async function getPagesNeedingIndexNowSync(
  event: H3Event | undefined,
  limit = 100
): Promise<{ route: string }[]> {
  const db = await getDb(event)
  if (!db)
    return []

  return db.all<{ route: string }>(`
    SELECT route FROM ai_ready_pages
    WHERE indexed = 1
      AND is_error = 0
      AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)
    LIMIT ?
  `, [limit])
}

/**
 * Mark pages as synced to IndexNow
 */
export async function markIndexNowSynced(
  event: H3Event | undefined,
  routes: string[]
): Promise<void> {
  const db = await getDb(event)
  if (!db || routes.length === 0)
    return

  const now = Date.now()
  const placeholders = routes.map(() => '?').join(',')
  await db.exec(
    `UPDATE ai_ready_pages SET indexnow_synced_at = ? WHERE route IN (${placeholders})`,
    [now, ...routes]
  )
}

/**
 * Count pages needing IndexNow sync
 */
export async function countPagesNeedingIndexNowSync(
  event: H3Event | undefined
): Promise<number> {
  const db = await getDb(event)
  if (!db)
    return 0

  const row = await db.first<{ count: number }>(`
    SELECT COUNT(*) as count FROM ai_ready_pages
    WHERE indexed = 1
      AND is_error = 0
      AND (indexnow_synced_at IS NULL OR indexnow_synced_at < indexed_at)
  `)
  return row?.count || 0
}
```

### 3. Key Verification Route

**`src/runtime/server/routes/[key].txt.get.ts`**

```typescript
import { defineEventHandler, getRouterParam } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export default defineEventHandler((event) => {
  const key = getRouterParam(event, 'key')
  const config = useRuntimeConfig()['nuxt-ai-ready']

  if (!config.indexNow?.key || key !== config.indexNow.key)
    return null // 404

  return config.indexNow.key
})
```

### 4. IndexNow Utility

**`src/runtime/server/utils/indexnow.ts`**

Stateless submission logic.

```typescript
import type { H3Event } from 'h3'
import { useSiteConfig } from '#imports'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getPagesNeedingIndexNowSync, markIndexNowSynced } from '../db/queries'

interface IndexNowResult {
  success: boolean
  submitted: number
  remaining: number
  error?: string
}

/**
 * Submit pending pages to IndexNow
 * Queries DB for pages needing sync, submits, marks as synced
 */
export async function syncToIndexNow(
  event: H3Event,
  limit = 100
): Promise<IndexNowResult> {
  const config = useRuntimeConfig()['nuxt-ai-ready']

  if (!config.indexNow?.enabled || !config.indexNow?.key) {
    return { success: false, submitted: 0, remaining: 0, error: 'IndexNow not configured' }
  }

  // Get pages needing sync
  const pages = await getPagesNeedingIndexNowSync(event, limit)
  if (pages.length === 0) {
    return { success: true, submitted: 0, remaining: 0 }
  }

  const routes = pages.map(p => p.route)

  // Submit to IndexNow
  const result = await submitToIndexNow(routes, config.indexNow)

  if (result.success) {
    // Mark as synced
    await markIndexNowSynced(event, routes)
  }

  const remaining = await countPagesNeedingIndexNowSync(event)

  return {
    success: result.success,
    submitted: result.success ? routes.length : 0,
    remaining,
    error: result.error,
  }
}

/**
 * Submit URLs to IndexNow API
 */
export async function submitToIndexNow(
  routes: string[],
  config: { key: string, host?: string }
): Promise<{ success: boolean, error?: string }> {
  const siteConfig = useSiteConfig()
  const siteUrl = siteConfig.url

  if (!siteUrl) {
    return { success: false, error: 'Site URL not configured' }
  }

  const host = config.host || 'api.indexnow.org'
  const endpoint = `https://${host}/indexnow`

  // Convert routes to absolute URLs
  const urlList = routes.map(route =>
    route.startsWith('http') ? route : `${siteUrl}${route}`
  )

  const body = {
    host: new URL(siteUrl).host,
    key: config.key,
    keyLocation: `${siteUrl}/${config.key}.txt`,
    urlList,
  }

  const response = await $fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch((err: Error) => ({ error: err.message }))

  if (response && typeof response === 'object' && 'error' in response) {
    return { success: false, error: response.error as string }
  }

  return { success: true }
}
```

### 5. Sync Endpoint

**`src/runtime/server/routes/__ai-ready/indexnow.post.ts`**

```typescript
import { defineEventHandler, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { countPagesNeedingIndexNowSync } from '../../db/queries'
import { syncToIndexNow } from '../../utils/indexnow'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()['nuxt-ai-ready']

  if (!config.indexNow?.enabled) {
    return { error: 'IndexNow not enabled' }
  }

  // Optional secret check
  const query = getQuery(event)
  if (config.runtimeSync?.secret && query.secret !== config.runtimeSync.secret) {
    return { error: 'Invalid secret' }
  }

  const limit = Number(query.limit) || 100

  return syncToIndexNow(event, limit)
})
```

### 6. Stats Tracking

Store aggregate stats in `_ai_ready_info` table:

```typescript
// Keys used:
// - indexnow_total_submitted: cumulative URL count
// - indexnow_last_submitted_at: timestamp of last successful submission
// - indexnow_last_error: most recent error message (cleared on success)
```

**`src/runtime/server/db/queries.ts`** additions:

```typescript
/**
 * Update IndexNow stats after submission
 */
export async function updateIndexNowStats(
  event: H3Event | undefined,
  submitted: number,
  error?: string
): Promise<void> {
  const db = await getDb(event)
  if (!db)
    return

  const now = Date.now()

  if (error) {
    await db.exec(
      'INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)',
      ['indexnow_last_error', error]
    )
  }
  else {
    // Increment total
    const existing = await db.first<{ value: string }>(
      'SELECT value FROM _ai_ready_info WHERE id = ?',
      ['indexnow_total_submitted']
    )
    const total = (Number.parseInt(existing?.value || '0', 10) || 0) + submitted

    await db.exec(
      'INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)',
      ['indexnow_total_submitted', String(total)]
    )
    await db.exec(
      'INSERT OR REPLACE INTO _ai_ready_info (id, value) VALUES (?, ?)',
      ['indexnow_last_submitted_at', String(now)]
    )
    await db.exec(
      'DELETE FROM _ai_ready_info WHERE id = ?',
      ['indexnow_last_error']
    )
  }
}

/**
 * Get IndexNow stats
 */
export async function getIndexNowStats(
  event: H3Event | undefined
): Promise<{ totalSubmitted: number, lastSubmittedAt: number | null, lastError: string | null }> {
  const db = await getDb(event)
  if (!db)
    return { totalSubmitted: 0, lastSubmittedAt: null, lastError: null }

  const rows = await db.all<{ id: string, value: string }>(
    'SELECT id, value FROM _ai_ready_info WHERE id LIKE ?',
    ['indexnow_%']
  )

  const stats: Record<string, string> = {}
  for (const row of rows) {
    stats[row.id] = row.value
  }

  return {
    totalSubmitted: Number.parseInt(stats.indexnow_total_submitted || '0', 10) || 0,
    lastSubmittedAt: stats.indexnow_last_submitted_at ? Number.parseInt(stats.indexnow_last_submitted_at, 10) : null,
    lastError: stats.indexnow_last_error || null,
  }
}
```

Update `syncToIndexNow` to track stats:

```typescript
// After submission in syncToIndexNow():
if (result.success) {
  await markIndexNowSynced(event, routes)
  await updateIndexNowStats(event, routes.length)
}
else {
  await updateIndexNowStats(event, 0, result.error)
}
```

### 7. Status Endpoint Update

**`src/runtime/server/routes/__ai-ready/status.get.ts`**

Add IndexNow stats to status response:

```typescript
// Add to response:
const indexNowStats = await getIndexNowStats(event)
const indexNowPending = await countPagesNeedingIndexNowSync(event)

{
  // ... existing fields
  indexNow: {
    pending: indexNowPending,
    totalSubmitted: indexNowStats.totalSubmitted,
    lastSubmittedAt: indexNowStats.lastSubmittedAt,
    lastError: indexNowStats.lastError,
  }
}
```

### 8. Module Configuration

**`src/module.ts`** additions:

```typescript
// Add to ModuleOptions interface
indexNow?: {
  enabled?: boolean
  key?: string
  host?: string
}

// Add to runtimeConfig
runtimeConfig: {
  public: {
    'nuxt-ai-ready': {
      // ... existing config
      indexNow: options.indexNow || { enabled: false },
    },
  },
}

// Register key verification route (dynamic)
if (options.indexNow?.key) {
  addServerHandler({
    route: `/${options.indexNow.key}.txt`,
    handler: resolve('./runtime/server/routes/indexnow-key.get'),
  })
}
```

## Integration Flow

### After Indexing

```
poll/scheduled task → indexes pages → updates indexed_at
                                           ↓
                            indexnow_synced_at < indexed_at (stale)
                                           ↓
                            page appears in getPagesNeedingIndexNowSync()
```

### Sync Trigger

```
POST /__ai-ready/indexnow?limit=100
           ↓
    getPagesNeedingIndexNowSync()
           ↓
    submitToIndexNow(routes)
           ↓
    markIndexNowSynced(routes)
           ↓
    { submitted: 50, remaining: 150 }
```

### Cron/CI Integration

```bash
# Call after poll completes
curl -X POST "https://mysite.com/__ai-ready/poll?secret=xxx"
curl -X POST "https://mysite.com/__ai-ready/indexnow?secret=xxx&limit=100"
```

Or chain in scheduled task:
```typescript
// In ai-ready-index.ts task
await batchIndexPages(event, batchSize)
await syncToIndexNow(event, 100)
```

## API Reference

### IndexNow Submission API

```
POST https://api.indexnow.org/indexnow
Content-Type: application/json

{
  "host": "example.com",
  "key": "your-api-key",
  "keyLocation": "https://example.com/your-api-key.txt",
  "urlList": [
    "https://example.com/page1",
    "https://example.com/page2"
  ]
}
```

Response codes:
- `200` - OK, URLs submitted
- `202` - Accepted, URLs will be processed
- `400` - Bad request (invalid key, URLs, etc.)
- `403` - Key not found at keyLocation
- `422` - URLs don't match host
- `429` - Too many requests (rate limited)

### Supported Search Engines

| Engine | Endpoint |
|--------|----------|
| Bing/IndexNow | api.indexnow.org |
| Yandex | yandex.com/indexnow |
| Naver | searchadvisor.naver.com/indexnow |
| Seznam | search.seznam.cz/indexnow |

Submitting to one endpoint notifies all participating engines.

## Implementation Steps

1. **Add configuration types** to `ModuleOptions`
2. **Create key verification route** for `/{key}.txt`
3. **Create indexnow utility** with batching logic
4. **Create plugin** to hook into `ai-ready:page:indexed`
5. **Add `contentChanged` to hook context** in `indexPage.ts`
6. **Create manual submission endpoint** at `/__ai-ready/indexnow`
7. **Update module.ts** to register routes and config
8. **Add tests** for submission logic
9. **Update documentation**

## Future Enhancements

- **Prerender integration**: Submit all URLs after `nuxi generate`
- **Retry logic**: Queue failed submissions for retry
- **Analytics**: Track submission success/failure rates
- **Multiple engines**: Option to submit to specific engines
- **Webhook**: Notify external service on submission
