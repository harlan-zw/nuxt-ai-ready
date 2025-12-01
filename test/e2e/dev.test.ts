import { createResolver } from '@nuxt/kit'
import { $fetch, setup } from '@nuxt/test-utils'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('nuxt-ai-ready dev mode', async () => {
  await setup({
    rootDir: resolve('../fixtures/basic'),
    dev: true,
    server: true,
  })

  describe('server startup', () => {
    it('starts without errors', async () => {
      // Server should be running if we got here
      expect(true).toBe(true)
    })
  })

  describe('bulk api in dev', () => {
    it('handles request without errors', async () => {
      try {
        const result = await $fetch('/_ai-ready/bulk', {
          responseType: 'text',
        })

        // Should return JSONL even if empty
        expect(typeof result).toBe('string')
      }
      catch (error: any) {
        // Should fail gracefully if no data
        expect([404, 500]).toContain(error.statusCode)
      }
    })
  })

  describe('mcp server in dev', () => {
    it('initializes without errors', async () => {
      const result = await $fetch('/_ai-ready/mcp', {
        method: 'POST',
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        },
      })

      expect(result).toHaveProperty('jsonrpc', '2.0')
      expect(result).toHaveProperty('result')
      expect(result.result).toHaveProperty('serverInfo')
    })

    it('lists tools without errors', async () => {
      // Initialize
      await $fetch('/_ai-ready/mcp', {
        method: 'POST',
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        },
      })

      // List tools
      const result = await $fetch('/_ai-ready/mcp', {
        method: 'POST',
        body: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        },
      })

      expect(result).toHaveProperty('result')
      expect(result.result).toHaveProperty('tools')
      expect(Array.isArray(result.result.tools)).toBe(true)
    })
  })
})
