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
