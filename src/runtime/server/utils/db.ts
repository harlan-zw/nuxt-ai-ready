import type { BulkChunk } from '../../types'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../logger'

// Extend NitroApp with our custom properties
declare module 'nitropack' {
  interface NitroApp {
    _bulkDocuments?: Promise<BulkChunk[]>
  }
}

export async function* streamBulkDocuments(): AsyncGenerator<BulkChunk> {
  const config = useRuntimeConfig()
  const bulkRoute = (config['nuxt-ai-ready'] as any)?.bulkRoute

  const response = await fetch(bulkRoute).catch((err) => {
    logger.warn('Documents loading failed:', err)
    throw err
  })

  if (!response.ok || !response.body)
    throw new Error(`Failed to fetch bulk documents: ${response.statusText}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done)
        break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)

        if (line)
          yield JSON.parse(line)

        newlineIndex = buffer.indexOf('\n')
      }
    }

    // Process remaining buffer
    if (buffer.trim())
      yield JSON.parse(buffer.trim())
  }
  finally {
    reader.releaseLock()
  }
}

export async function useBulkDocuments(): Promise<BulkChunk[]> {
  const nitroApp = useNitroApp()

  if (nitroApp._bulkDocuments)
    return await nitroApp._bulkDocuments

  logger.debug('Lazy loading bulk documents...')
  nitroApp._bulkDocuments = (async () => {
    const documents: BulkChunk[] = []

    for await (const chunk of streamBulkDocuments())
      documents.push(chunk)

    return documents
  })()

  return await nitroApp._bulkDocuments
}
