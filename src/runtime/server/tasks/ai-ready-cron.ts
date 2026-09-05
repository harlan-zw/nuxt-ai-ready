import { defineTask } from '#nuxtseo/nitro'
import { logger } from '../logger'
import { runCron } from '../utils/runCron'

export default defineTask({
  meta: {
    name: 'ai-ready:cron',
    description: 'Scheduled task for AI Ready indexing',
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

    // runCron reports a failure rather than throwing, because a throw from a
    // scheduled task has no handler above it and reaches the platform as an
    // opaque exception. Logging it here is what makes it visible to whatever
    // reads the task's output.
    if (result.failed)
      logger.error(`[ai-ready:cron] Run failed at the ${result.failed.stage} stage: ${result.failed.message}`)

    return { result }
  },
})
