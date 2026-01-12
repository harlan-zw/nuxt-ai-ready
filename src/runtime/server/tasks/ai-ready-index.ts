import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineTask, useRuntimeConfig } from 'nitropack/runtime'
import { batchIndexPages } from '../utils/batchIndex'
import { syncToIndexNow } from '../utils/indexnow'

export default defineTask({
  meta: {
    name: 'ai-ready:index',
    description: 'Index pending pages for AI Ready',
  },
  async run({ payload }) {
    const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig & { indexNow?: { enabled?: boolean } }
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

    // Sync to IndexNow if enabled (batch all pending pages)
    let indexNowResult
    if (config.indexNow?.enabled) {
      indexNowResult = await syncToIndexNow(mockEvent, 100).catch((err) => {
        console.warn('[ai-ready:index] IndexNow sync failed:', err.message)
        return { success: false, submitted: 0, error: err.message }
      })
    }

    return {
      result: {
        indexed: result.indexed,
        remaining: result.remaining,
        errors: result.errors,
        complete: result.complete,
        indexNow: indexNowResult
          ? {
              submitted: indexNowResult.submitted,
              error: indexNowResult.error,
            }
          : undefined,
      },
    }
  },
})
