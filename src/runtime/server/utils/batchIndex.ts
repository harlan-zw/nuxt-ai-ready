import type { H3Event } from 'h3'
import type { PageEntry } from '../db/queries'
import { countPages, queryPages } from '../db/queries'
import { logger } from '../logger'
import { indexPageByRoute } from './indexPage'

export interface BatchIndexOptions {
  /** Max pages per batch (default: 10, max: 50) */
  limit?: number
  /** Process until complete (ignores limit) */
  all?: boolean
  /** Max ms to run (for all mode, default: 30000) */
  timeout?: number
}

export interface BatchIndexResult {
  /** Number of pages indexed */
  indexed: number
  /** Pages remaining to index */
  remaining: number
  /** Routes that failed to index */
  errors: string[]
  /** Duration in ms */
  duration: number
  /** True if all pages are indexed */
  complete: boolean
}

/**
 * Batch index pending pages (max 50 per batch)
 * Shared logic used by poll endpoint and scheduled task
 */
export async function batchIndexPages(
  event: H3Event | undefined,
  options: BatchIndexOptions = {},
): Promise<BatchIndexResult> {
  const startTime = Date.now()
  const limit = Math.min(options.limit ?? 3, 50)
  const timeout = options.timeout ?? 30000

  const beforeCount = await countPages(event, { where: { pending: true } })
  if (beforeCount === 0) {
    return {
      indexed: 0,
      remaining: 0,
      errors: [],
      duration: Date.now() - startTime,
      complete: true,
    }
  }

  let indexed = 0
  const errors: string[] = []
  let iteration = 0

  while (true) {
    // Check timeout for 'all' mode
    if (options.all && (Date.now() - startTime) >= timeout) {
      logger.debug(`[batchIndex] Timeout reached after ${Date.now() - startTime}ms`)
      break
    }

    // Check limit for non-all mode
    if (!options.all && iteration >= limit) {
      break
    }

    const pages = await queryPages(event, { where: { pending: true }, limit: 1 }) as PageEntry[]
    const route = pages[0]?.route
    if (!route)
      break

    iteration++

    const result = await indexPageByRoute(route, event, {
      markFailedAsError: true,
      force: true,
    })

    if (result.success) {
      indexed++
      logger.debug(`[batchIndex] Indexed: ${route}`)
    }
    else {
      errors.push(route)
    }
  }

  const remaining = await countPages(event, { where: { pending: true } })

  return {
    indexed,
    remaining,
    errors,
    duration: Date.now() - startTime,
    complete: remaining === 0,
  }
}
