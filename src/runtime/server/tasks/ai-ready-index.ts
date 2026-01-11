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
    const limit = (payload?.limit as number) ?? config.runtimeSync.batchSize

    // Create a minimal mock event for internal fetch
    // Only $fetch is used from the event in indexPageByRoute
    const mockEvent = { $fetch: globalThis.$fetch } as any

    const result = await batchIndexPages(db, mockEvent, limit)

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
