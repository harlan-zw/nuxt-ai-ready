import type { H3Event } from 'h3'
import { defineTask } from 'nitropack/runtime'
import { runCron } from '../utils/runCron'

export default defineTask({
  meta: {
    name: 'ai-ready:cron',
    description: 'Scheduled task for AI Ready - runs indexing and IndexNow sync',
  },
  async run({ payload }) {
    // Skip in dev - context not fully available
    if (import.meta.dev)
      return { result: {} }
    // Create a minimal mock event for internal operations
    const mockEvent = {
      $fetch: globalThis.$fetch,
    } as unknown as H3Event

    const result = await runCron(mockEvent, {
      batchSize: payload?.limit as number | undefined,
    })

    return { result }
  },
})
