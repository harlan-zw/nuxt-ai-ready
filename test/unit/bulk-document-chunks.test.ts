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
        i: generateVectorId(route, idx),
        r: route,
        c: chunk.content,
        ...(chunk.metadata?.headers && { h: chunk.metadata.headers }),
        ...(chunk.metadata?.loc?.lines && { l: [chunk.metadata.loc.lines.from, chunk.metadata.loc.lines.to] }),
      }
      bulkChunks.push(bulkChunk)
    }

    expect(bulkChunks.length).toBeGreaterThan(0)

    // Each chunk should be a complete entry
    bulkChunks.forEach((chunk, idx) => {
      expect(chunk.i).toBe(generateVectorId(route, idx))
      expect(chunk.r).toBe(route)
      expect(chunk.c).toBeDefined()

      // Metadata should be present
      expect(chunk.h).toBeDefined()
      expect(chunk.h).toHaveProperty('h1')
      expect(chunk.l).toBeDefined()
      expect(chunk.l).toHaveLength(2)
    })

    // Verify headers are different across chunks
    const uniqueH2s = new Set(bulkChunks.map(c => c.h?.h2))
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
        i: generateVectorId(route, idx),
        r: route,
        c: chunk.content,
        ...(chunk.metadata?.headers && { h: chunk.metadata.headers }),
        ...(chunk.metadata?.loc?.lines && { l: [chunk.metadata.loc.lines.from, chunk.metadata.loc.lines.to] }),
      })
    }

    // Simulate consumer reassembling chunks by route
    const chunksByRoute = bulkChunks.filter(c => c.r === route)
    expect(chunksByRoute.length).toBe(mdreamChunks.length)

    // Reassemble in order - extract index from id suffix
    const sortedChunks = chunksByRoute.sort((a, b) => {
      const aIdx = Number.parseInt(a.i.split('-').pop()!)
      const bIdx = Number.parseInt(b.i.split('-').pop()!)
      return aIdx - bIdx
    })
    const reassembled = sortedChunks.map(c => c.c).join('\n\n')
    expect(reassembled.length).toBeGreaterThan(0)
    expect(reassembled).toContain('Getting Started')
  })
})
