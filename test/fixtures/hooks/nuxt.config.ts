import type { BulkChunk } from '../../../src/runtime/types'
import type { LlmsTxtGeneratePayload } from '../../../src/types'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineNuxtConfig } from 'nuxt/config'

const chunks: Array<{
  id: string
  route: string
  chunkIndex: number
  title: string
  contentPreview: string
}> = []

export default defineNuxtConfig({
  extends: ['../.pages-layer'],
  hooks: {
    // Test ai-ready:llms-txt hook
    'ai-ready:llms-txt': (payload: LlmsTxtGeneratePayload) => {
      console.log('[Hook] ai-ready:llms-txt called')
      console.log('[Hook] Pages count:', payload.pages.length)

      // Example: Add custom section to llms.txt using mutable pattern
      payload.content += '\n\n## Custom Hook Section\n\nThis was added by a hook!'
      payload.fullContent += '\n\n## Custom Hook Section (Full)\n\nThis was added by a hook!'
    },

    // Test ai-ready:chunk hook
    'ai-ready:chunk': (context: {
      chunk: BulkChunk
      route: string
      title: string
      description: string
      headings: Array<Record<string, string>>
    }) => {
      console.log('[Hook] ai-ready:chunk called for:', context.route, 'chunk', context.chunk.chunkIndex)

      // Track chunk metadata
      chunks.push({
        id: context.chunk.id,
        route: context.route,
        chunkIndex: context.chunk.chunkIndex,
        title: context.title,
        contentPreview: context.chunk.content.substring(0, 50),
      })
    },

    'build:done': () => {
      // Write chunks metadata to a file for testing
      if (chunks.length > 0) {
        const outputPath = resolve(__dirname, '.output/test-chunks.json')
        writeFileSync(outputPath, JSON.stringify(chunks, null, 2))
        console.log(`[Chunk Tracker] Wrote ${chunks.length} chunks to ${outputPath}`)
      }
    },
  },
})
