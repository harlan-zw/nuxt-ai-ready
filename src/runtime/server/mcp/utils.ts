import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export function jsonResult(data: any, pretty = true): CallToolResult {
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  return { content: [{ type: 'text', text }] }
}

export function toonResult(toon: string): CallToolResult {
  return { content: [{ type: 'text', text: toon }] }
}
