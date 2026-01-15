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

    // Don't pass an event - tasks run outside request context
    // runCron and its dependencies use useRuntimeConfig() without event
    const result = await runCron(undefined, {
      batchSize: payload?.limit as number | undefined,
    })

    return { result }
  },
})
