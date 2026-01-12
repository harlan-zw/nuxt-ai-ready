# Todo Next

## Next Steps

### Priority 1: LibSQL/Turso Testing
- [ ] Create Vercel + Turso test fixture
- [ ] Test cold start restore with LibSQL
- [ ] Document LibSQL connection config

### Priority 2: (Completed) Performance
- [x] Streaming llms-full.txt - now streams from DB at runtime
- [x] Replaced JSONL with SQLite for prerender data storage
- [x] Simplified getPages() to use DB directly
- [ ] Consider incremental llms-full.txt updates for very large sites

---

## ✅ Completed

### Documentation
- [x] Document new endpoints (`stale`, `prune`, `reindex`) in runtime-indexing.md
- [x] Add MCP tools docs (`get_page`, `list_pages` pagination)
- [x] Add CLI commands section (curl examples for endpoints)

### Developer Experience
- [x] Better error messages when sitemap is missing/empty

### Runtime Architecture
- [x] Prerender is source of truth, runtime sync opt-in

### Edge Database Testing
- [x] Cloudflare D1 test fixture with wrangler
- [x] Cold start restore verified with D1

### Runtime Sync Endpoints
- [x] `GET /__ai-ready/stale` - preview stale routes
- [x] `POST /__ai-ready/prune` - manual prune trigger
- [x] `POST /__ai-ready/reindex` - force reindex single route

### MCP Improvements
- [x] `get_page` tool - fetch single page with markdown
- [x] `list_pages` pagination (limit/offset/hasMore)

---

## Changelog (Recent)

- ✅ Updated MCP docs with `get_page` tool and `list_pages` pagination params
- ✅ Updated runtime-indexing docs with stale/prune/reindex endpoints
- ✅ Added CLI commands section with curl examples
- ✅ Improved sitemap error messages with actionable hints
- ✅ Added Cloudflare D1 test fixture with wrangler (131 tests passing)
- ✅ Added `GET /__ai-ready/stale` endpoint - preview stale routes
- ✅ Added `POST /__ai-ready/prune` endpoint - manual prune trigger
- ✅ Added `POST /__ai-ready/reindex` endpoint - force reindex single route
- ✅ Added `get_page` MCP tool - fetch single page with markdown
- ✅ Added pagination to `list_pages` MCP tool (limit/offset/hasMore)
- ✅ Docs updated for new `runtimeSync` config
- ✅ Dev mode console hint when `getPages()` called
- ✅ Fixed `$fetch<T>` test type errors
- ✅ Added `@types/better-sqlite3`
