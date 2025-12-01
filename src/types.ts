import type { ProcessedFile } from 'mdream/llms-txt'

/**
 * Hook payload for mdream:llms-txt
 * Called after mdream has generated llms.txt, before writing to disk
 *
 * IMPORTANT: This uses a mutable pattern. Hooks should modify the content
 * and fullContent properties directly rather than returning values.
 *
 * @example
 * nuxt.hooks.hook('mdream:llms-txt', async (payload) => {
 *   payload.content += '\n\n## Custom Section\n\nAdded by hook!'
 *   payload.fullContent += '\n\n## Custom Section (Full)\n\nAdded by hook!'
 * })
 */
export interface LlmsTxtGeneratePayload {
  /** Current llms.txt content - modify this directly */
  content: string
  /** Current llms-full.txt content - modify this directly */
  fullContent: string
  /** All routes with their metadata (read-only) */
  pages: ProcessedFile[]
}
