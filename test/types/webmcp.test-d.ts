import type { ModuleOptions } from '../../src/module'
import { expectTypeOf, test } from 'vitest'
import { useWebMcpTool } from '../../src/runtime/app/composables/webmcp'
import { defineWebMcpTool } from '../../src/runtime/webmcp'

declare global {
  interface ImportMeta {
    dev: boolean
  }
}

test('infers tool input from its JSON schema and preserves arbitrary output', () => {
  const tool = defineWebMcpTool({
    name: 'set_count',
    description: 'Sets a count.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        mode: { type: 'string', enum: ['replace', 'increment'] },
      },
      required: ['count'],
    },
    execute: input => ({
      count: input.count,
      mode: input.mode ?? 'replace',
    }),
  })

  expectTypeOf(tool.execute).parameter(0).toEqualTypeOf<{
    count: number
    mode?: 'replace' | 'increment'
  }>()
  expectTypeOf(tool.execute).returns.toMatchTypeOf<
    { count: number, mode: 'replace' | 'increment' } | Promise<{ count: number, mode: 'replace' | 'increment' }>
  >()
})

test('infers composable tool input directly from its JSON schema', () => {
  useWebMcpTool({
    name: 'set_count',
    description: 'Sets a count.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        mode: { type: 'string', enum: ['replace', 'increment'] },
      },
      required: ['count'],
    },
    execute: (input) => {
      expectTypeOf(input).toEqualTypeOf<{
        count: number
        mode?: 'replace' | 'increment'
      }>()
      return input.count
    },
  })
})

test('types shared tool behavior and transport attachments', () => {
  const options = {
    tools: {
      listPages: {
        defaultLimit: 7,
        webmcp: { enabled: false },
      },
      searchPages: {
        defaultLimit: 5,
        mcp: { enabled: false },
        webmcp: {
          maxOutputChars: 3000,
          exposedTo: ['https://agent.example.com'],
        },
      },
    },
    webmcp: true,
  } satisfies ModuleOptions

  expectTypeOf(options.tools.searchPages.defaultLimit).toEqualTypeOf<number>()
})

test('rejects WebMCP options on a disabled attachment', () => {
  const options: ModuleOptions = {
    tools: {
      searchPages: {
        // @ts-expect-error disabled attachments cannot carry active options
        webmcp: { enabled: false, maxOutputChars: 3000 },
      },
    },
  }
  expectTypeOf(options).toMatchTypeOf<ModuleOptions>()
})
