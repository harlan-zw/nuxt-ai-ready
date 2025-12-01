import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TagIdMap } from 'mdream'
import { htmlToMarkdownSplitChunks } from 'mdream/splitter'
import { estimateTokenCount } from 'tokenx'
import { describe, expect, it } from 'vitest'

describe('hTML to Markdown Chunking', () => {
  const tmpHtml = readFileSync(join(process.cwd(), 'test', 'unit', 'fixture.html'), 'utf-8')

  it('should extract chunks from tmp.html', () => {
    const chunks = htmlToMarkdownSplitChunks(tmpHtml, {
      headersToSplitOn: [],
      origin: 'https://example.com',
      chunkSize: 256,
      stripHeaders: false,
      lengthFunction(text) {
        return estimateTokenCount(text)
      },
    })

    expect(chunks).toBeDefined()
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('should use TagIdMap for headersToSplitOn', () => {
    const chunks = htmlToMarkdownSplitChunks(tmpHtml, {
      headersToSplitOn: [TagIdMap.h1, TagIdMap.h2, TagIdMap.h3],
      origin: 'https://example.com',
      chunkSize: 256,
      stripHeaders: false,
      lengthFunction(text: string) {
        return estimateTokenCount(text)
      },
    })
    // Should have headers in metadata
    const hasHeaderMetadata = chunks.some((chunk: any) =>
      chunk.metadata?.headers && Object.keys(chunk.metadata.headers).length > 0,
    )
    expect(hasHeaderMetadata).toBe(true)
  })
})
