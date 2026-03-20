# Migrating to nuxt-ai-ready v1

Use this prompt with your AI coding agent (Claude Code, Cursor, Copilot, etc.) to automatically migrate your project.

## Agent Prompt

```
I'm upgrading nuxt-ai-ready to v1. Apply these breaking changes to my codebase:

1. **Config rename**: `cacheMaxAgeSeconds` is now `llmsTxtCacheSeconds` in nuxt.config.ts under the `aiReady` key.

2. **Type rename**: `BulkDocument` is now `PageDocument`. Update all imports from 'nuxt-ai-ready'.

3. **Hook rename**: The Nitro runtime hook `ai-ready:markdown` is now `ai-ready:page:markdown`. Update all `hooks.hook()` and `hooks.callHook()` calls.

4. **Headings type change**: `PageEntry.headings` and `PageIndexedContext.headings` changed from `string` (JSON) to `Array<Record<string, string>>` (parsed). Remove any `JSON.parse()` calls on `.headings` since it's now already parsed.

5. **Auth mechanism change**: All `/__ai-ready/*` endpoints now use `Authorization: Bearer <token>` header instead of `?secret=<token>` query parameter. Update any fetch calls, curl commands, CI scripts, or external cron jobs that hit these endpoints.

Search my entire codebase for these patterns and apply all necessary changes. Don't ask questions, just fix everything.
```
