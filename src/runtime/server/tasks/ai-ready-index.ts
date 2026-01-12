import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineTask, useRuntimeConfig } from 'nitropack/runtime'
import { batchIndexPages } from '../utils/batchIndex'

export default defineTask({
  meta: {
    name: 'ai-ready:index',
    description: 'Index pending pages for AI Ready',
  },
  async run({ payload }) {
    const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
    const limit = (payload?.limit as number) ?? config.runtimeSync.batchSize

    // Create a minimal mock event for internal fetch
    // Tasks don't have H3Event, but batchIndexPages uses $fetch for fetching pages
    const mockEvent = {
      $fetch: globalThis.$fetch,
    } as unknown as H3Event

    const result = await batchIndexPages(mockEvent, {
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
