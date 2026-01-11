import type { DatabaseAdapter } from './schema'

export interface DumpRow {
  route: string
  route_key: string
  title: string
  description: string
  markdown: string
  headings: string
  keywords: string
  updated_at: string
  indexed_at: number
  is_error: number
  source?: 'prerender' | 'runtime'
}

/**
 * Export all pages as JSON for dump
 */
export async function exportDump(db: DatabaseAdapter): Promise<DumpRow[]> {
  return db.all<DumpRow>(`
    SELECT route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, source
    FROM ai_ready_pages
  `)
}

/**
 * Compress dump data to base64 gzip
 */
export async function compressDump(data: DumpRow[]): Promise<string> {
  const json = JSON.stringify(data)
  const encoder = new TextEncoder()
  const stream = new Blob([encoder.encode(json)]).stream()
  const compressed = stream.pipeThrough(new CompressionStream('gzip'))
  const buffer = await new Response(compressed).arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}

/**
 * Decompress dump from base64 gzip
 */
export async function decompressDump(base64: string): Promise<DumpRow[]> {
  const buffer = Buffer.from(base64, 'base64')
  const stream = new Blob([buffer]).stream()
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(decompressed).text()
  return JSON.parse(text)
}

/**
 * Import dump into database
 * Prerendered dumps default to source='prerender', last_seen_at=NULL
 */
export async function importDump(db: DatabaseAdapter, rows: DumpRow[]): Promise<void> {
  for (const row of rows) {
    const source = row.source || 'prerender' // Default for legacy dumps
    await db.exec(`
      INSERT OR REPLACE INTO ai_ready_pages (route, route_key, title, description, markdown, headings, keywords, updated_at, indexed_at, is_error, indexed, source, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)
    `, [row.route, row.route_key, row.title, row.description, row.markdown, row.headings, row.keywords, row.updated_at, row.indexed_at, row.is_error, source])
  }
}
