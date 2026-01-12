import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { useRuntimeConfig } from 'nitropack/runtime'
import { batchIndexPages } from './batchIndex'
import { syncToIndexNow } from './indexnow'

export interface CronResult {
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
export async function runCron(event: H3Event, options?: { batchSize?: number }): Promise<CronResult> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  const results: CronResult = {}

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
  }

  return results
}
