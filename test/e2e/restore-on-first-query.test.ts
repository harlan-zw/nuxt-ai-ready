import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { join } from 'pathe'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

// A WebMCP-only site: no MCP Toolkit, no cron. Its first page query must still
// see the prerendered pages on a server that starts with an empty database.
describe('restore on first query', async () => {
  await setup({
    rootDir: resolve('../fixtures/webmcp'),
    build: true,
    server: true,
    nuxtConfig: {
      mcp: { enabled: false },
      aiReady: {
        database: { filename: join(tmpdir(), `ai-ready-restore-${randomUUID()}.db`) },
      },
    },
  })

  it('lists prerendered pages before any MCP request or restore call', async () => {
    const res = await $fetch<{ page: { route: string } | null }>('/__ai-ready/pages?route=/about')

    expect(res.page?.route).toBe('/about')
  })
})
