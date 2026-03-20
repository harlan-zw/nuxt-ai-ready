import { eventHandler } from 'h3'
import { runCron } from '../../utils/runCron'

/**
 * Cron endpoint for platforms that use HTTP-based cron (Vercel, etc.)
 */
export default eventHandler(async (event) => {
  const { requireAuth } = await import('../../utils/auth')
  requireAuth(event)

  return runCron(event)
})
