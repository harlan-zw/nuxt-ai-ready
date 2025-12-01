import type { BulkChunk } from '../../src/module'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TagIdMap } from 'mdream'
import { htmlToMarkdownSplitChunks } from 'mdream/splitter'
import { estimateTokenCount } from 'tokenx'
import { describe, expect, it } from 'vitest'

function generateVectorId(route: string, chunkIdx: number): string {
  const hash = createHash('sha256').update(route).digest('hex').substring(0, 48)
  return `${hash}-${chunkIdx}`
}

describe('bulkChunk format', () => {
  const tmpHtml = readFileSync(join(process.cwd(), 'test', 'unit', 'fixture.html'), 'utf-8')
  const route = '/docs/getting-started'
  const title = 'Getting Started'
  const description = 'Quick start guide'

  it('should create individual BulkChunk entries', () => {
    const mdreamChunks = htmlToMarkdownSplitChunks(tmpHtml, {
      headersToSplitOn: [TagIdMap.h1, TagIdMap.h2, TagIdMap.h3],
      origin: 'https://example.com',
      chunkSize: 256,
      stripHeaders: false,
      lengthFunction(text: string) {
        return estimateTokenCount(text)
      },
    })

    // Simulate what module.ts does - stream chunks without holding all in memory
    const bulkChunks: BulkChunk[] = []
    for (let idx = 0; idx < mdreamChunks.length; idx++) {
      const chunk = mdreamChunks[idx]!
      const bulkChunk: BulkChunk = {
        id: generateVectorId(route, idx),
        route,
        chunkIndex: idx,
        content: chunk.content,
        headers: chunk.metadata?.headers,
        loc: chunk.metadata?.loc,
        title,
        description,
      }
      bulkChunks.push(bulkChunk)
    }

    expect(bulkChunks.length).toBeGreaterThan(0)

    // Each chunk should be a complete JSONL entry
    bulkChunks.forEach((chunk, idx) => {
      expect(chunk.id).toBe(generateVectorId(route, idx))
      expect(chunk.route).toBe(route)
      expect(chunk.chunkIndex).toBe(idx)
      expect(chunk.content).toBeDefined()
      expect(chunk.title).toBe(title)
      expect(chunk.description).toBe(description)

      // Metadata should be present
      expect(chunk.headers).toBeDefined()
      expect(chunk.headers).toHaveProperty('h1')
      expect(chunk.loc).toBeDefined()
    })

    // Verify headers are different across chunks
    const uniqueH2s = new Set(bulkChunks.map(c => c.headers?.h2))
    expect(uniqueH2s.size).toBeGreaterThan(1)
  })

  it('should allow consumers to reassemble by route', () => {
    const mdreamChunks = htmlToMarkdownSplitChunks(tmpHtml, {
      headersToSplitOn: [TagIdMap.h1, TagIdMap.h2, TagIdMap.h3],
      origin: 'https://example.com',
      chunkSize: 256,
      stripHeaders: false,
      lengthFunction(text: string) {
        return estimateTokenCount(text)
      },
    })

    const bulkChunks: BulkChunk[] = []
    for (let idx = 0; idx < mdreamChunks.length; idx++) {
      const chunk = mdreamChunks[idx]!
      bulkChunks.push({
        id: generateVectorId(route, idx),
        route,
        chunkIndex: idx,
        content: chunk.content,
        headers: chunk.metadata?.headers,
        loc: chunk.metadata?.loc,
        title,
        description,
      })
    }

    // Simulate consumer reassembling chunks by route
    const chunksByRoute = bulkChunks.filter(c => c.route === route)
    expect(chunksByRoute.length).toBe(mdreamChunks.length)

    // Reassemble in order
    const sortedChunks = chunksByRoute.sort((a, b) => a.chunkIndex - b.chunkIndex)
    const reassembled = sortedChunks.map(c => c.content).join('\n\n')
    expect(reassembled.length).toBeGreaterThan(0)
    expect(reassembled).toContain('Getting Started')
  })
})
