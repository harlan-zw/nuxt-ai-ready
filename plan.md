# Plan: Simplify Runtime Architecture

## Goal

Make prerender the source of truth. Runtime just restores and serves. Runtime sync becomes opt-in for dynamic content.

**Current flow (complex):**
```
Runtime → restore dump → sitemap seeder → index-now/cron → llms.txt works
```

**Target flow (simple):**
```
Runtime → restore dump → llms.txt works!
(opt-in: runtime sync for dynamic content)
```

---

## Phase 1: Verify Prerender Covers Everything ✅

### 1.1 Audit prerender coverage
- [x] Confirm `sitemap:prerender:done` crawls ALL sitemap URLs (not just prerendered pages)
- [x] Verify SSR-only pages in sitemap get indexed during prerender
- [x] Check dump includes all pages from sitemap crawl

### 1.2 Fix any gaps in prerender
- [x] Already implemented - `crawlSitemapContent` fetches all sitemap URLs
- [x] DB fully populated before dump export

---

## Phase 2: Simplify Runtime Startup ✅

### 2.1 Remove mandatory sitemap seeder
- [x] `sitemap-seeder.ts` - made conditional (only runs if `runtimeSync.enabled`)
- [x] On restore, DB already has all pages from prerender dump
- [x] No seeding needed for standard deploy

### 2.2 Simplify `getPages()` ✅
- [x] Replaced JSONL with SQLite for prerender data storage
- [x] Virtual module now reads from SQLite via better-sqlite3
- [x] Runtime reads from DB via db0
- [x] Dev mode: returns empty with console warning (unchanged)

### 2.3 llms.txt works immediately
- [x] `buildLlmsTxt()` reads from DB (already populated from dump)
- [x] No dependency on indexing state
- [x] Falls back to sitemap-only if DB empty (SSR-only sites)

---

## Phase 3: Opt-in Runtime Sync ✅

### 3.1 New config structure
```ts
aiReady: {
  // Existing options...

  pruneTtl: 0,             // prune stale routes (stays at root - separate concern)

  // NEW: opt-in runtime sync (replaces current indexing config)
  runtimeSync: {
    enabled: false,        // default OFF
    ttl: 3600,             // re-index pages older than this (seconds)
    sitemapTtl: 3600,      // refresh sitemap routes (seconds)
    batchSize: 20,         // pages per sync batch
    cron: '*/5 * * * *',   // enables scheduled sync (optional)
    secret: '',            // auth for manual trigger endpoint
  }
}
```

### 3.2 Conditional plugin/route loading
- [x] `sitemap-seeder.ts` plugin - only register if `runtimeSync.enabled`
- [x] `ai-ready-index.ts` task - only register if `runtimeSync.enabled && runtimeSync.cron`
- [x] `index-now.post.ts` route - only register if `runtimeSync.enabled`
- [x] `status.get.ts` route - only register if `runtimeSync.enabled`

### 3.3 Remove old config (breaking change)
- [x] Deleted `indexing` config
- [x] Deleted `ttl` at root
- [x] Deleted `sitemapTtl` at root
- [x] `pruneTtl` stays at root (no change)

---

## Phase 4: Improve Dev Mode (Deferred)

### 4.1 Dev mode behavior
- [ ] Keep returning empty from `getPages()`
- [ ] Add clear console message on first call: "Page data unavailable in dev. Run `nuxi generate` for full metadata."
- [ ] llms.txt in dev: show sitemap routes without titles + hint message

---

## Phase 5: Update Documentation ✅

### 5.1 CLAUDE.md
- [x] Update config examples
- [x] Clarify prerender is required for full features
- [x] Document new runtime architecture

### 5.2 docs/ (Deferred)
- [ ] Update runtime-indexing guide → "Runtime Sync (Optional)"
- [ ] Update config reference

---

## Phase 6: Cleanup (Deferred)

### 6.1 Remove dead code
- [ ] Virtual module for page-data if no longer needed
- [ ] Simplify `pageData.ts` to just DB reads

### 6.2 Consolidate
- [ ] `batchIndex.ts` only used by runtime sync
- [ ] Move indexing-related code under `runtime-sync/` directory?

---

## Migration Path

### Breaking changes (introduced):
- `indexing` config removed → use `runtimeSync`
- `ttl` at root removed → use `runtimeSync.ttl`
- `sitemapTtl` at root removed → use `runtimeSync.sitemapTtl`
- SSR-only sites must explicitly enable `runtimeSync` for titles

---

## Success Criteria ✅

1. **Fresh deploy**: llms.txt returns full data immediately (no waiting) ✅
2. **`getPages()`**: Returns data immediately after restore ✅
3. **MCP search**: Works immediately after restore ✅
4. **Simple config**: No config needed for standard SSG/hybrid sites ✅
5. **Opt-in complexity**: Runtime sync only for users who need it ✅

---

## Decisions Made

1. **Dev mode**: Return empty + console hint (keep simple)
2. **index-now endpoint**: Only exists when `runtimeSync.enabled` (simpler)
3. **pruneTtl**: Stays at root level (separate concern from sync)
4. **Breaking changes**: Accepted - remove old config instead of deprecating
