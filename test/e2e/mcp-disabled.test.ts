import { createResolver } from '@nuxt/kit'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('disabled MCP Toolkit', async () => {
  await setup({
    rootDir: resolve('../fixtures/mcp-disabled'),
    build: true,
    server: true,
  })

  it('does not advertise or serve an unavailable MCP endpoint', async () => {
    const llmsTxt = await $fetch('/llms.txt') as string
    expect(llmsTxt).not.toContain('[MCP]')
    expect((await fetch('/mcp')).status).toBe(404)
    expect((await fetch('/mcp/server-card')).status).toBe(404)
    expect((await fetch('/.well-known/api-catalog')).status).toBe(404)
    expect((await fetch('/.well-known/ai-catalog.json')).status).toBe(404)
  })
})
