import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { useEvent, useRuntimeConfig } from 'nitropack/runtime'
import { cleanupOldCronRuns, completeCronRun, startCronRun } from '../db/queries'
import { batchIndexPages } from './batchIndex'
import { syncToIndexNow } from './indexnow'

function getEvent(providedEvent?: H3Event): H3Event | undefined {
  if (providedEvent)
    return providedEvent
  try {
    return useEvent()
  }
  catch {
    return undefined
  }
}

export interface CronResult {
  runId?: number | null
  index?: {
    indexed: number
    remaining: number
    errors?: string[]
    complete: boolean
  }
  indexNow?: {
    submitted: number
    remaining: number
    error?: string
  }
}

/**
 * Run cron job logic - shared between scheduled task and HTTP endpoint
 */
export async function runCron(providedEvent: H3Event | undefined, options?: { batchSize?: number }): Promise<CronResult> {
  // Skip in dev - DB and context not available
  if (import.meta.dev)
    return {}

  // Get event from context if not provided (for scheduled tasks)
  const event = getEvent(providedEvent)
  if (!event) {
    console.warn('[ai-ready:cron] No event context available, skipping')
    return {}
  }

  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const results: CronResult = {}
  const allErrors: string[] = []

  // Start logging this cron run
  const runId = await startCronRun(event)
  results.runId = runId

  // Run runtime indexing if enabled
  if (config.runtimeSync.enabled) {
    const limit = options?.batchSize ?? config.runtimeSync.batchSize
    const indexResult = await batchIndexPages(event, {
      limit,
      all: false,
    })
    results.index = {
      indexed: indexResult.indexed,
      remaining: indexResult.remaining,
      errors: indexResult.errors.length > 0 ? indexResult.errors : undefined,
      complete: indexResult.complete,
    }
    if (indexResult.errors.length > 0) {
      allErrors.push(...indexResult.errors)
    }
  }

  // Run IndexNow sync if key is configured
  if (config.indexNowKey) {
    const indexNowResult = await syncToIndexNow(event, 100).catch((err) => {
      console.warn('[ai-ready:cron] IndexNow sync failed:', err.message)
      return { success: false, submitted: 0, remaining: 0, error: err.message }
    })
    results.indexNow = {
      submitted: indexNowResult.submitted,
      remaining: indexNowResult.remaining,
      error: indexNowResult.error,
    }
    if (indexNowResult.error) {
      allErrors.push(`IndexNow: ${indexNowResult.error}`)
    }
  }

  // Complete the cron run log
  if (runId) {
    await completeCronRun(event, runId, {
      pagesIndexed: results.index?.indexed || 0,
      pagesRemaining: results.index?.remaining || 0,
      indexNowSubmitted: results.indexNow?.submitted || 0,
      indexNowRemaining: results.indexNow?.remaining || 0,
      errors: allErrors,
    })

    // Cleanup old runs periodically (keep last 50)
    await cleanupOldCronRuns(event, 50)
  }

  return results
}
