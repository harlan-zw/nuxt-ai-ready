import type { H3Event } from 'h3'
import type { PageEntry } from '../db/queries'
import { countPages, queryPages } from '../db/queries'
import { logger } from '../logger'
import { indexPageByRoute } from './indexPage'

/** Concurrent fetches per batch (balances speed vs memory/subrequests) */
const CONCURRENCY = 5

export interface BatchIndexOptions {
  /** Max pages per batch (default: 10, max: 50) */
  limit?: number
  /** Process until complete (ignores limit) */
  all?: boolean
  /** Max ms to run (for all mode, default: 30000) */
  timeout?: number
  /** Concurrent page fetches (default: 5) */
  concurrency?: number
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
 * Batch index pending pages with parallel processing
 * Processes pages in concurrent chunks for better throughput
 */
export async function batchIndexPages(
  event: H3Event | undefined,
  options: BatchIndexOptions = {},
): Promise<BatchIndexResult> {
  const startTime = Date.now()
  const limit = Math.min(options.limit ?? 10, 50)
  const timeout = options.timeout ?? 30000
  const concurrency = options.concurrency ?? CONCURRENCY

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
  let processed = 0

  while (processed < limit) {
    // Check timeout for 'all' mode
    if (options.all && (Date.now() - startTime) >= timeout) {
      logger.debug(`[batchIndex] Timeout reached after ${Date.now() - startTime}ms`)
      break
    }

    // Fetch next chunk of pending pages
    const chunkSize = Math.min(concurrency, limit - processed)
    const pages = await queryPages(event, { where: { pending: true }, limit: chunkSize }) as PageEntry[]

    if (pages.length === 0)
      break

    // Process chunk in parallel
    logger.debug(`[batchIndex] Processing ${pages.length} pages concurrently`)
    const results = await Promise.all(
      pages.map(async (page) => {
        const result = await indexPageByRoute(page.route, event, {
          markFailedAsError: true,
          force: true,
        })
        return { route: page.route, success: result.success }
      }),
    )

    // Tally results
    for (const result of results) {
      processed++
      if (result.success) {
        indexed++
        logger.debug(`[batchIndex] Indexed: ${result.route}`)
      }
      else {
        errors.push(result.route)
      }
    }

    // Exit if we got fewer pages than requested (no more pending)
    if (pages.length < chunkSize)
      break

    // For non-all mode, respect the limit
    if (!options.all && processed >= limit)
      break
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
