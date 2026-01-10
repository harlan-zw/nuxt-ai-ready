import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineTask, useRuntimeConfig } from 'nitropack/runtime'
import { useDatabase } from '../db'
import { batchIndexPages } from '../utils/batchIndex'

export default defineTask({
  meta: {
    name: 'ai-ready:index',
    description: 'Index pending pages for AI Ready',
  },
  async run({ payload }) {
    const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
    const db = await useDatabase()
    const limit = (payload?.limit as number) ?? config.indexing.scheduledBatchSize

    // Create a minimal mock event for internal fetch
    // The task uses $fetch directly which doesn't need full H3Event
    const mockEvent = {
      $fetch: globalThis.$fetch,
    } as Parameters<typeof batchIndexPages>[1]

    const result = await batchIndexPages(db, mockEvent, {
      limit,
      all: false,
    })

    return {
      result: {
        indexed: result.indexed,
        remaining: result.remaining,
        errors: result.errors,
        complete: result.complete,
      },
    }
  },
})
