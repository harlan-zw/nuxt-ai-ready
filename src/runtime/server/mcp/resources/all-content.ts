// @ts-expect-error untyped
import { defineMcpResource, textResult } from '#imports'
import { streamBulkDocuments } from '../../utils/db'

export default defineMcpResource({
  uri: 'content://all',
  name: 'All Site Content',
  description: 'Complete indexed site content in JSONL format (newline-delimited JSON)',
  mimeType: 'application/x-ndjson',
  handler: async () => {
    const lines: string[] = []
    for await (const doc of streamBulkDocuments())
      lines.push(JSON.stringify(doc))

    return textResult(lines.join('\n'))
  },
})
