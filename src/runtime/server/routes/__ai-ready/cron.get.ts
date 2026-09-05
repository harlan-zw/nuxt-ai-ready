import { createError, eventHandler } from '#nuxtseo/h3'
import { runCron } from '../../utils/runCron'

/**
 * Cron endpoint for platforms that use HTTP-based cron (Vercel, etc.)
 */
export default eventHandler(async (event) => {
  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  const result = await runCron(event)

  // Unlike the scheduled task, this endpoint has an HTTP status as its failure
  // signal: cron monitors judge success by status code, so a failed run must
  // not answer 200. `data` carries the structured failure in the error body.
  if (result.failed) {
    throw createError({
      statusCode: 500,
      message: `Cron run failed at the ${result.failed.stage} stage: ${result.failed.message}`,
      data: result.failed,
    })
  }

  return result
})
