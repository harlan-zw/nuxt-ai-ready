import type { H3Event } from 'h3'
import type { PageEntry } from '../db/queries'
import type { DatabaseAdapter } from '../db/schema'
import { countPages, queryPages } from '../db/queries'
import { logger } from '../logger'
import { indexPageByRoute } from './indexPage'

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
 */
export async function batchIndexPages(
  db: DatabaseAdapter,
  event: H3Event,
  limit = 10,
): Promise<BatchIndexResult> {
  const startTime = Date.now()
  const batchSize = Math.min(limit, 50)

  const beforeCount = await countPages(db, { where: { pending: true } })
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

  for (let i = 0; i < batchSize; i++) {
    const pages = await queryPages(db, { where: { pending: true }, limit: 1 }) as PageEntry[]
    const route = pages[0]?.route
    if (!route)
      break

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

  const remaining = await countPages(db, { where: { pending: true } })

  return {
    indexed,
    remaining,
    errors,
    duration: Date.now() - startTime,
    complete: remaining === 0,
  }
}
